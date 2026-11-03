// supabase/functions/send-contact-email/lib.ts
//
// Pure helpers for the contact email function: request validation, access
// checks, attachment path rules, key selection and email rendering. Nothing
// here touches the network or Deno APIs, so every rule is unit tested.

/** Largest request body accepted, in bytes. The form sends a few kilobytes. */
export const MAX_BODY_BYTES = 64 * 1024;

/** Attachments per message; the form allows a handful of documents. */
export const MAX_ATTACHMENTS = 5;

/** Largest attachment the storage bucket accepts (matches the bucket limit). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Lifetime of the emailed download links. The admin inbox issues short ones. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;

/** Bucket and object prefix the public upload policy allows. */
export const ATTACHMENT_BUCKET = 'contact-attachments';
export const ATTACHMENT_PREFIX = 'contact-attachments/contact-';

/** Origins allowed to call the function when none are configured. */
export const DEFAULT_ALLOWED_ORIGINS = [
  'https://www.raunakchoudhary.com',
  'https://raunakchoudhary.com',
  'http://localhost:3000',
];

const FIELD_LIMITS = {
  name: 120,
  email: 254,
  organization: 160,
  role: 60,
  inquiryType: 60,
  subject: 200,
  message: 5000,
  attachmentName: 200,
};

const INQUIRY_LABELS: Record<string, string> = {
  'full-time-opportunity': 'Full-time job opportunity',
  'contract-opportunity': 'Contract or consulting opportunity',
  'internship-offer': 'Internship opportunity',
  'freelance-project': 'Freelance project',
  collaboration: 'Technical collaboration',
  'startup-opportunity': 'Startup opportunity',
  'research-project': 'Research project',
  'mentorship-request': 'Mentorship request',
  'speaking-event': 'Speaking or conference invitation',
  'interview-request': 'Interview or podcast request',
  networking: 'Professional networking',
  'technical-discussion': 'Technical discussion',
  'general-inquiry': 'General inquiry',
};

export interface AttachmentInput {
  name: string;
  filePath: string;
  size: number;
  type: string;
}

export interface ContactRequest {
  name: string;
  email: string;
  organization: string;
  role: string;
  inquiryType: string;
  subject: string;
  message: string;
  attachments: AttachmentInput[];
}

export interface SignedAttachment extends AttachmentInput {
  url: string;
  signedUrlError: string;
}

/** Escapes text for safe inclusion in HTML content or attribute values. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Reduces an attachment reference to a bucket-relative object path.
 * Accepts a plain path or a public/signed storage URL of this bucket.
 */
export function normalizeAttachmentPath(candidate: unknown): string {
  if (typeof candidate !== 'string' || candidate.length === 0) return '';
  try {
    const url = new URL(candidate);
    for (
      const marker of [
        `/storage/v1/object/public/${ATTACHMENT_BUCKET}/`,
        `/storage/v1/object/sign/${ATTACHMENT_BUCKET}/`,
      ]
    ) {
      if (url.pathname.includes(marker)) {
        return decodeURIComponent(url.pathname.split(marker)[1] ?? '').replace(/^\/+/, '');
      }
    }
    return '';
  } catch {
    return candidate.replace(/^\/+/, '');
  }
}

/**
 * True when the object path is one the public contact form could have
 * uploaded: under the allowed prefix, no traversal, no empty segments.
 * Everything else is refused so the function never signs a link to a file
 * the caller did not upload.
 */
export function isAllowedAttachmentPath(path: string): boolean {
  if (!path.startsWith(ATTACHMENT_PREFIX)) return false;
  if (path.length > 512) return false;
  const segments = path.split('/');
  return segments.length === 2 &&
    segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

/** Checks whether a request origin may call the function. */
export function isAllowedOrigin(origin: string | null, allowed: string[] = DEFAULT_ALLOWED_ORIGINS): boolean {
  return Boolean(origin) && allowed.includes(origin as string);
}

/** Parses the ALLOWED_ORIGINS setting (comma separated) or falls back to the defaults. */
export function allowedOriginsFrom(setting: string | undefined): string[] {
  const parsed = (setting ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_ORIGINS;
}

/** Response headers for a request from an allowed origin. */
export function corsHeadersFor(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

/**
 * Public keys that identify a legitimate caller. Supabase injects the
 * publishable keys as a JSON object keyed by name once new API keys exist,
 * and the legacy anon key until those are disabled.
 */
export function acceptedPublicKeys(env: Record<string, string | undefined>): Set<string> {
  const keys = new Set<string>();
  try {
    const published = JSON.parse(env.SUPABASE_PUBLISHABLE_KEYS ?? '{}');
    for (const value of Object.values(published)) {
      if (typeof value === 'string' && value) keys.add(value);
    }
  } catch {
    // Malformed setting: fall through to the legacy key only.
  }
  if (env.SUPABASE_ANON_KEY) keys.add(env.SUPABASE_ANON_KEY);
  return keys;
}

/**
 * Picks the server-side key used to sign attachment links: the secret key
 * named "default" from SUPABASE_SECRET_KEYS, else any secret key, else the
 * legacy service-role key. The source is reported so logs show which path
 * is in use during the key cutover.
 */
export function selectServiceKey(
  env: Record<string, string | undefined>,
): { key: string; source: 'secret' | 'legacy' } | null {
  try {
    const secrets = JSON.parse(env.SUPABASE_SECRET_KEYS ?? '{}') as Record<string, unknown>;
    const preferred = secrets.default ?? Object.values(secrets)[0];
    if (typeof preferred === 'string' && preferred) return { key: preferred, source: 'secret' };
  } catch {
    // Malformed setting: fall through to the legacy key.
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY) return { key: env.SUPABASE_SERVICE_ROLE_KEY, source: 'legacy' };
  return null;
}

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= FIELD_LIMITS.email;

const text = (value: unknown, limit: number): string | null => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > limit ? null : trimmed;
};

/**
 * Validates and normalises a request body.
 * @returns the clean request, or a list of field errors.
 */
export function validateContactRequest(
  body: unknown,
): { ok: true; data: ContactRequest } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: ['body must be a JSON object'] };
  }
  const input = body as Record<string, unknown>;

  const name = text(input.name, FIELD_LIMITS.name);
  const email = text(input.email, FIELD_LIMITS.email);
  const organization = text(input.organization, FIELD_LIMITS.organization);
  const role = text(input.role, FIELD_LIMITS.role);
  const inquiryType = text(input.inquiryType, FIELD_LIMITS.inquiryType);
  const subject = text(input.subject, FIELD_LIMITS.subject);
  const message = text(input.message, FIELD_LIMITS.message);

  if (!name) errors.push('name is required and at most 120 characters');
  if (!email || !isEmail(email)) errors.push('email must be a valid address');
  if (organization === null) errors.push('organization is too long');
  if (role === null) errors.push('role is too long');
  if (inquiryType === null) errors.push('inquiryType is too long');
  if (!subject || subject.length < 5) errors.push('subject must be 5 to 200 characters');
  if (!message || message.length < 20) errors.push('message must be 20 to 5000 characters');

  const rawAttachments = input.attachments ?? [];
  const attachments: AttachmentInput[] = [];
  if (!Array.isArray(rawAttachments)) {
    errors.push('attachments must be a list');
  } else if (rawAttachments.length > MAX_ATTACHMENTS) {
    errors.push(`at most ${MAX_ATTACHMENTS} attachments`);
  } else {
    rawAttachments.forEach((item, index) => {
      const entry = (item ?? {}) as Record<string, unknown>;
      const filePath = normalizeAttachmentPath(entry.filePath ?? entry.path ?? entry.url);
      const attachmentName = text(entry.name, FIELD_LIMITS.attachmentName);
      const size = typeof entry.size === 'number' ? entry.size : Number(entry.size);
      if (!isAllowedAttachmentPath(filePath)) errors.push(`attachment ${index + 1} is not an allowed upload path`);
      if (!attachmentName) errors.push(`attachment ${index + 1} name is missing or too long`);
      if (!Number.isFinite(size) || size < 0 || size > MAX_ATTACHMENT_BYTES) {
        errors.push(`attachment ${index + 1} size is invalid`);
      }
      attachments.push({
        name: attachmentName ?? '',
        filePath,
        size: Number.isFinite(size) ? size : 0,
        type: typeof entry.type === 'string' ? entry.type.slice(0, 100) : 'application/octet-stream',
      });
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      name: name as string,
      email: email as string,
      organization: organization as string,
      role: role as string,
      inquiryType: inquiryType as string,
      subject: subject as string,
      message: message as string,
      attachments,
    },
  };
}

/** Human-readable inquiry label; unknown values are shown escaped as-is. */
export function inquiryLabel(type: string): string {
  return INQUIRY_LABELS[type] ?? (type || 'Not specified');
}

const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

/**
 * Renders the notification email. Every visitor-supplied value is escaped in
 * the HTML version; the text version carries values verbatim since it is
 * never parsed as markup.
 */
export function renderEmail(
  data: ContactRequest,
  attachments: SignedAttachment[],
  receivedAt: string,
): { html: string; text: string } {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#555;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:6px 0">${
      escapeHtml(value || 'Not specified')
    }</td></tr>`;

  const attachmentRows = attachments.map((file) => {
    const link = file.url
      ? `<a href="${escapeHtml(file.url)}">${escapeHtml(file.name)}</a>`
      : `${escapeHtml(file.name)} <span style="color:#a00">(link unavailable: ${
        escapeHtml(file.signedUrlError || 'unknown error')
      })</span>`;
    return `<li>${link} <span style="color:#777">(${escapeHtml(formatSize(file.size))})</span></li>`;
  });

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Portfolio contact: ${escapeHtml(data.subject)}</title></head>
<body style="margin:0;padding:24px;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;background:#f6f6f6">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;padding:28px;border:1px solid #e5e5e5">
<h1 style="font-size:20px;margin:0 0 4px">New message from the portfolio contact form</h1>
<p style="margin:0 0 20px;color:#777">Received ${escapeHtml(receivedAt)}</p>
<table style="border-collapse:collapse;margin-bottom:20px">
${row('From', data.name)}
${row('Email', data.email)}
${row('Organisation', data.organization)}
${row('Role', data.role)}
${row('Inquiry', inquiryLabel(data.inquiryType))}
${row('Subject', data.subject)}
</table>
<h2 style="font-size:16px;margin:0 0 8px">Message</h2>
<div style="white-space:pre-wrap;background:#fafafa;border:1px solid #eee;border-radius:6px;padding:14px;margin-bottom:20px">${
    escapeHtml(data.message)
  }</div>
${
    attachments.length
      ? `<h2 style="font-size:16px;margin:0 0 8px">Attachments (links expire in 24 hours)</h2><ul style="margin:0 0 20px;padding-left:20px">${
        attachmentRows.join('')
      }</ul>`
      : ''
  }
<p style="margin:0"><a href="mailto:${escapeHtml(data.email)}?subject=${
    encodeURIComponent(`Re: ${data.subject}`)
  }" style="display:inline-block;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Reply to ${
    escapeHtml(data.name)
  }</a></p>
</div></body></html>`;

  const textLines = [
    'New message from the portfolio contact form',
    `Received: ${receivedAt}`,
    '',
    `From: ${data.name}`,
    `Email: ${data.email}`,
    `Organisation: ${data.organization || 'Not specified'}`,
    `Role: ${data.role || 'Not specified'}`,
    `Inquiry: ${inquiryLabel(data.inquiryType)}`,
    `Subject: ${data.subject}`,
    '',
    'Message:',
    data.message,
  ];
  if (attachments.length) {
    textLines.push('', 'Attachments (links expire in 24 hours):');
    for (const file of attachments) {
      textLines.push(
        `- ${file.name} (${formatSize(file.size)}): ${
          file.url || `link unavailable: ${file.signedUrlError || 'unknown error'}`
        }`,
      );
    }
  }
  return { html, text: textLines.join('\n') };
}
