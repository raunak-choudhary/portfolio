// supabase/functions/send-contact-email/index.ts
//
// Entry point: wires the handler to Supabase Storage (signed download links)
// and Resend (delivery), then serves it. All logic lives in handler.ts and
// lib.ts, which are unit tested with `deno test`.
//
// Configuration (Supabase function secrets and injected variables):
//   SUPABASE_URL, SUPABASE_SECRET_KEYS or SUPABASE_SERVICE_ROLE_KEY  injected
//   SUPABASE_PUBLISHABLE_KEYS or SUPABASE_ANON_KEY                   injected
//   RESEND_API_KEY            secret, required
//   CONTACT_RECIPIENT_EMAIL   optional: overrides the default recipient in handler.ts
//   CONTACT_SENDER            optional: "Name <address>" of a verified sender
//   ALLOWED_ORIGINS           optional: comma-separated list; defaults in lib.ts
//
// Deploy with JWT verification off (supabase/config.toml), because the site
// sends a publishable key, which is not a JWT; the handler authorises in code.

import { createClient } from 'npm:@supabase/supabase-js@2.106.2';
import { ATTACHMENT_BUCKET, selectServiceKey } from './lib.ts';
import { type HandlerDeps, handleRequest } from './handler.ts';

const env = Deno.env.toObject();

const serviceKey = selectServiceKey(env);
if (!serviceKey) {
  console.error('send-contact-email: no service key available; attachment links will be unavailable');
} else {
  console.log(`send-contact-email: signing attachment links with the ${serviceKey.source} key`);
}

const storage = serviceKey && env.SUPABASE_URL
  ? createClient(env.SUPABASE_URL, serviceKey.key, { auth: { persistSession: false, autoRefreshToken: false } }).storage
  : null;

/**
 * Keys confirmed by Supabase Auth, remembered for a short time so a disabled
 * key stops working within minutes, and capped so unknown keys cannot grow
 * memory. Failures are never cached: each refused key costs one request,
 * and the shape check in the handler already filters random strings.
 */
const VERIFIED_KEY_TTL_MS = 10 * 60 * 1000;
const VERIFIED_KEY_CAP = 32;
const verifiedKeys = new Map<string, number>();

const deps: HandlerDeps = {
  env,
  verifyKey: async (key) => {
    if (!env.SUPABASE_URL) return false;
    const confirmedAt = verifiedKeys.get(key);
    if (confirmedAt && Date.now() - confirmedAt < VERIFIED_KEY_TTL_MS) return true;
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: key } });
    if (response.ok) {
      if (verifiedKeys.size >= VERIFIED_KEY_CAP) verifiedKeys.delete(verifiedKeys.keys().next().value as string);
      verifiedKeys.set(key, Date.now());
    }
    return response.ok;
  },
  signUrl: async (path, ttlSeconds) => {
    if (!storage) return { error: 'service key unavailable' };
    const { data, error } = await storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, ttlSeconds);
    return data?.signedUrl ? { url: data.signedUrl } : { error: error?.message ?? 'signing failed' };
  },
  sendEmail: async (message) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: message.from,
        to: message.to,
        reply_to: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    const body = await response.json().catch(() => ({}));
    return response.ok && body?.id
      ? { id: body.id }
      : { error: body?.message ?? `Resend responded ${response.status}` };
  },
};

Deno.serve((request) => handleRequest(request, deps));
