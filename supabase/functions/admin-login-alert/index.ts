// supabase/functions/admin-login-alert/index.ts
//
// Entry point: wires the alert handler to the throttle table (via the
// service key, never exposed to the browser) and to Resend, then serves it.
// Configuration: SUPABASE_URL and SUPABASE_SECRET_KEYS are injected;
// RESEND_API_KEY is the project secret already used by send-contact-email;
// CONTACT_RECIPIENT_EMAIL, ALERT_SENDER and ALLOWED_ORIGINS are optional.
// Deploy with JWT verification off (supabase/config.toml).

import { createClient } from 'npm:@supabase/supabase-js@2.106.2';
import { selectServiceKey } from '../send-contact-email/lib.ts';
import { type AlertState, type HandlerDeps, handleRequest } from './handler.ts';

const env = Deno.env.toObject();
const serviceKey = selectServiceKey(env);
const db = serviceKey && env.SUPABASE_URL
  ? createClient(env.SUPABASE_URL, serviceKey.key, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const STATE_TABLE = 'admin_login_alert_state';
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
  readState: async () => {
    if (!db) return null;
    const { data } = await db.from(STATE_TABLE).select('attempts, window_started_at, last_alert_at').eq('id', 1).maybeSingle();
    if (!data) return null;
    return { attempts: data.attempts ?? 0, windowStartedAt: data.window_started_at, lastAlertAt: data.last_alert_at } as AlertState;
  },
  writeState: async (state) => {
    if (!db) return { error: 'service key unavailable' };
    const { error } = await db.from(STATE_TABLE).upsert({
      id: 1,
      attempts: state.attempts,
      window_started_at: state.windowStartedAt,
      last_alert_at: state.lastAlertAt,
      updated_at: new Date().toISOString(),
    });
    return error ? { error: error.message } : {};
  },
  sendEmail: async (message) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    const body = await response.json().catch(() => ({}));
    return response.ok && body?.id ? { id: body.id } : { error: body?.message ?? `Resend responded ${response.status}` };
  },
};

Deno.serve((request) => handleRequest(request, deps));
