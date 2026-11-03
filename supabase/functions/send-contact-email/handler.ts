// supabase/functions/send-contact-email/handler.ts
//
// Request handler for the contact email function, with its side effects
// injected so it can be tested without the network:
//   signUrl    creates a time-limited download link for one storage object
//   sendEmail  delivers the rendered email (Resend in production)
//   env        configuration (Supabase-injected keys, Resend key, recipient)
//
// Access model: the gateway's JWT verification is off because the public key
// the site sends is not a JWT. The handler therefore authorises in code: the
// request must carry a known public key in the `apikey` header and come from
// an allowed origin. The service-side key never leaves this function.

import {
  acceptedPublicKeys,
  allowedOriginsFrom,
  type ContactRequest,
  corsHeadersFor,
  isAllowedOrigin,
  looksLikePublicKey,
  MAX_BODY_BYTES,
  renderEmail,
  SIGNED_URL_TTL_SECONDS,
  type SignedAttachment,
  validateContactRequest,
} from './lib.ts';

export interface HandlerDeps {
  env: Record<string, string | undefined>;
  /**
   * Confirms a public key belongs to this project when it is not among the
   * injected keys. In production this asks Supabase Auth, which answers 200
   * only for a valid key of the project, so both the legacy anon key and the
   * publishable key are recognised without relying on runtime variables.
   */
  verifyKey?: (key: string) => Promise<boolean>;
  signUrl: (path: string, ttlSeconds: number) => Promise<{ url: string } | { error: string }>;
  sendEmail: (
    message: { from: string; to: string[]; replyTo: string[]; subject: string; html: string; text: string },
  ) => Promise<{ id: string } | { error: string }>;
  now?: () => Date;
}

/** Default sender: Resend's shared test address, which delivers only to the account owner. */
const DEFAULT_SENDER = 'Portfolio Contact <onboarding@resend.dev>';

/**
 * Default recipient: the owner's address, which the site already publishes
 * on its Contact section. CONTACT_RECIPIENT_EMAIL overrides it.
 */
export const DEFAULT_RECIPIENT = 'raunakchoudhary17@gmail.com';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const receivedAtLabel = (date: Date) =>
  date.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short' });

function signAttachments(data: ContactRequest, deps: HandlerDeps): Promise<SignedAttachment[]> {
  return Promise.all(
    data.attachments.map(async (file) => {
      const result = await deps.signUrl(file.filePath, SIGNED_URL_TTL_SECONDS);
      return 'url' in result
        ? { ...file, url: result.url, signedUrlError: '' }
        : { ...file, url: '', signedUrlError: result.error };
    }),
  );
}

/** Handles one HTTP request. Exported for tests; index.ts wires it to Deno.serve. */
export async function handleRequest(request: Request, deps: HandlerDeps): Promise<Response> {
  const origin = request.headers.get('origin');
  const allowedOrigins = allowedOriginsFrom(deps.env.ALLOWED_ORIGINS);
  const originAllowed = isAllowedOrigin(origin, allowedOrigins);
  const cors = originAllowed
    ? corsHeadersFor(origin as string, request.headers.get('access-control-request-headers'))
    : {};

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: originAllowed ? 204 : 403, headers: cors });
  }
  if (!originAllowed) {
    return json(403, { success: false, error: 'Origin not allowed' });
  }
  if (request.method !== 'POST') {
    return json(405, { success: false, error: 'Method not allowed' }, cors);
  }

  // The current site sends the key as `apikey`; the build that is live until
  // the security deploy sends it only as a bearer token. Both are accepted so
  // the contact form keeps working through the cutover.
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const apiKey = request.headers.get('apikey') || bearer;
  const keyAccepted = Boolean(apiKey) &&
    (acceptedPublicKeys(deps.env).has(apiKey) ||
      (looksLikePublicKey(apiKey) && deps.verifyKey ? await deps.verifyKey(apiKey) : false));
  if (!keyAccepted) {
    return json(401, { success: false, error: 'Missing or unknown API key' }, cors);
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return json(413, { success: false, error: 'Request body too large' }, cors);
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return json(413, { success: false, error: 'Request body too large' }, cors);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return json(400, { success: false, error: 'Body must be JSON' }, cors);
  }

  const validation = validateContactRequest(parsed);
  if (!validation.ok) {
    return json(400, { success: false, error: 'Invalid request', details: validation.errors }, cors);
  }

  if (!deps.env.RESEND_API_KEY) {
    return json(500, { success: false, error: 'Email service not configured' }, cors);
  }

  const recipient = deps.env.CONTACT_RECIPIENT_EMAIL || DEFAULT_RECIPIENT;

  const attachments = await signAttachments(validation.data, deps);
  const receivedAt = receivedAtLabel((deps.now ?? (() => new Date()))());
  const { html, text } = renderEmail(validation.data, attachments, receivedAt);

  const delivery = await deps.sendEmail({
    from: deps.env.CONTACT_SENDER ?? DEFAULT_SENDER,
    to: [recipient],
    replyTo: [validation.data.email],
    subject: `Portfolio contact: ${validation.data.subject}`,
    html,
    text,
  });

  if ('error' in delivery) {
    console.error('send-contact-email: delivery failed:', delivery.error);
    return json(502, { success: false, error: 'Failed to send email' }, cors);
  }

  return json(200, {
    success: true,
    data: {
      emailId: delivery.id,
      attachmentCount: attachments.length,
      attachmentsWithLinks: attachments.filter((file) => file.url).length,
      receivedAt,
    },
  }, cors);
}
