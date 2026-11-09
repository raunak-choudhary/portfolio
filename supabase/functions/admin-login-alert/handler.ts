// supabase/functions/admin-login-alert/handler.ts
//
// Tells the owner when someone tries the admin login with an address that is
// not the admin's. The login page calls this after Supabase Auth refuses the
// address; the call is best effort and never changes the login outcome.
//
// Abuse control: at most one alert email per ALERT_INTERVAL_MS. Attempts
// inside the window are counted and reported in the next alert, so a flood
// of attempts costs one email, not hundreds, and the free email quota is
// safe. Nothing personal is stored: the state row holds a counter and two
// timestamps. The typed address appears only in the email, masked.
//
// Access model mirrors send-contact-email: allowed origin plus a known public
// key, with gateway JWT verification off because the publishable key is not
// a JWT.

import {
  acceptedPublicKeys,
  allowedOriginsFrom,
  corsHeadersFor,
  escapeHtml,
  isAllowedOrigin,
  looksLikePublicKey,
} from '../send-contact-email/lib.ts';

/** Minimum gap between two alert emails. */
export const ALERT_INTERVAL_MS = 30 * 60 * 1000;

/** Largest request body accepted; the payload is one short address. */
export const MAX_BODY_BYTES = 2 * 1024;

/** Default recipient: the owner's address, as on the Contact section. */
export const DEFAULT_RECIPIENT = 'raunakchoudhary17@gmail.com';

const DEFAULT_SENDER = 'Portfolio Security <onboarding@resend.dev>';

export interface AlertState {
  attempts: number;
  windowStartedAt: string | null;
  lastAlertAt: string | null;
}

export interface HandlerDeps {
  env: Record<string, string | undefined>;
  verifyKey?: (key: string) => Promise<boolean>;
  /** Reads the single throttle row; null when it does not exist yet. */
  readState: () => Promise<AlertState | null>;
  /** Replaces the throttle row. */
  writeState: (state: AlertState) => Promise<{ error?: string }>;
  sendEmail: (
    message: { from: string; to: string[]; subject: string; html: string; text: string },
  ) => Promise<{ id: string } | { error: string }>;
  now?: () => Date;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

/** "someone@example.com" becomes "s•••••@example.com"; anything odd becomes "an unreadable address". */
export function maskAddress(value: unknown): string {
  const text = String(value ?? '').trim().toLowerCase().slice(0, 254);
  const at = text.indexOf('@');
  if (at <= 0 || at === text.length - 1 || /[\s<>"'()]/.test(text)) return 'an unreadable address';
  const local = text.slice(0, at);
  const visible = local.slice(0, Math.min(3, Math.max(1, local.length - 1)));
  return `${visible}•••••${text.slice(at)}`;
}

/** New York time, the owner's time zone. */
export const whenLabel = (date: Date) =>
  date.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short' });

/**
 * Decides whether this attempt sends an alert. Pure, so the throttle is
 * unit tested without a database.
 */
export function nextState(previous: AlertState | null, now: Date): { state: AlertState; sendAlert: boolean; attemptsToReport: number } {
  const attempts = (previous?.attempts ?? 0) + 1;
  const lastAlert = previous?.lastAlertAt ? Date.parse(previous.lastAlertAt) : 0;
  const due = !lastAlert || now.getTime() - lastAlert >= ALERT_INTERVAL_MS;
  if (due) {
    return {
      sendAlert: true,
      attemptsToReport: attempts,
      state: { attempts: 0, windowStartedAt: now.toISOString(), lastAlertAt: now.toISOString() },
    };
  }
  return {
    sendAlert: false,
    attemptsToReport: attempts,
    state: { attempts, windowStartedAt: previous?.windowStartedAt ?? now.toISOString(), lastAlertAt: previous?.lastAlertAt ?? null },
  };
}

export function renderAlert(masked: string, attempts: number, when: string): { subject: string; html: string; text: string } {
  const plural = attempts === 1 ? 'attempt' : 'attempts';
  const subject = `Admin login attempt with another address (${attempts} ${plural})`;
  const text = [
    `Someone tried to sign in to the RC Portfolio admin with an address that is not yours.`,
    ``,
    `Attempts since the last alert: ${attempts}`,
    `Most recent address: ${masked}`,
    `Time: ${when} (New York)`,
    ``,
    `No code was sent and nothing was accessed. Signing in needs your inbox and your authenticator app.`,
    `Alerts are sent at most once every 30 minutes.`,
  ].join('\n');
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.5">
<h2 style="margin:0 0 8px">Admin login attempt with another address</h2>
<p>Someone tried to sign in to the RC Portfolio admin with an address that is not yours.</p>
<ul>
<li><strong>Attempts since the last alert:</strong> ${attempts}</li>
<li><strong>Most recent address:</strong> ${escapeHtml(masked)}</li>
<li><strong>Time:</strong> ${escapeHtml(when)} (New York)</li>
</ul>
<p>No code was sent and nothing was accessed. Signing in needs your inbox and your authenticator app.</p>
<p style="color:#666;font-size:13px">Alerts are sent at most once every 30 minutes.</p>
</div>`;
  return { subject, html, text };
}

export async function handleRequest(request: Request, deps: HandlerDeps): Promise<Response> {
  const origin = request.headers.get('origin');
  const originAllowed = isAllowedOrigin(origin, allowedOriginsFrom(deps.env.ALLOWED_ORIGINS));
  const cors = originAllowed ? corsHeadersFor(origin as string, request.headers.get('access-control-request-headers')) : {};

  if (request.method === 'OPTIONS') return new Response(null, { status: originAllowed ? 204 : 403, headers: cors });
  if (!originAllowed) return json(403, { success: false, error: 'Origin not allowed' });
  if (request.method !== 'POST') return json(405, { success: false, error: 'Method not allowed' }, cors);

  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const apiKey = request.headers.get('apikey') || bearer;
  const keyAccepted = Boolean(apiKey) &&
    (acceptedPublicKeys(deps.env).has(apiKey) ||
      (looksLikePublicKey(apiKey) && deps.verifyKey ? await deps.verifyKey(apiKey) : false));
  if (!keyAccepted) return json(401, { success: false, error: 'Missing or unknown API key' }, cors);

  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
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
  const attempted = (parsed as { attemptedEmail?: unknown })?.attemptedEmail;
  if (typeof attempted !== 'string' || !attempted.trim()) {
    return json(400, { success: false, error: 'attemptedEmail is required' }, cors);
  }

  const now = (deps.now ?? (() => new Date()))();
  const decision = nextState(await deps.readState(), now);
  const stored = await deps.writeState(decision.state);
  if (stored.error) {
    console.error('admin-login-alert: could not store throttle state:', stored.error);
    return json(500, { success: false, error: 'Alert state unavailable' }, cors);
  }
  if (!decision.sendAlert) {
    return json(200, { success: true, data: { alerted: false, attempts: decision.attemptsToReport } }, cors);
  }
  if (!deps.env.RESEND_API_KEY) return json(500, { success: false, error: 'Email service not configured' }, cors);

  const rendered = renderAlert(maskAddress(attempted), decision.attemptsToReport, whenLabel(now));
  const delivery = await deps.sendEmail({
    from: deps.env.ALERT_SENDER ?? DEFAULT_SENDER,
    to: [deps.env.CONTACT_RECIPIENT_EMAIL || DEFAULT_RECIPIENT],
    ...rendered,
  });
  if ('error' in delivery) {
    console.error('admin-login-alert: delivery failed:', delivery.error);
    return json(502, { success: false, error: 'Failed to send alert' }, cors);
  }
  return json(200, { success: true, data: { alerted: true, attempts: decision.attemptsToReport, emailId: delivery.id } }, cors);
}
