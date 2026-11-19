// src/components/admin/Security/securityModel.js
//
// The rules and the wording of the admin's security screens, kept pure so
// every branch is unit tested: the voyage's Security chapter (Cassiopeia)
// builds on all of it, and the classic Security screen shares the guard and
// the naming rule so the two can never disagree.
//
// Inputs are shaped like the real sources: Supabase MFA factors (id,
// friendly_name, created_at), admin_passkeys rows (id, device_name, rp_id,
// created_at, last_used_at), the passkey function's status (bridge factor id,
// passkey count) and the session's amr entries ({ method, timestamp in
// seconds }). Nothing here is invented: a fact the inputs do not carry is
// returned as null and the screen leaves it out.

// No imports: the model stays free of the Supabase client, so any screen or
// test can load it without environment variables.

/** The name of the first app when the owner leaves the name empty; equal to authService's PRIMARY_FACTOR_NAME (a test keeps them together). */
export const PRIMARY_APP_NAME = 'Primary authenticator';

/** The relying party id of a passkey made on the local dev server. */
export const LOCALHOST_RP_ID = 'localhost';

/** True for a passkey that works only on the local dev server. */
export const isLocalhostPasskey = (passkey) => passkey?.rp_id === LOCALHOST_RP_ID;

/**
 * Whether passkey sign-in is in use: any passkey row, a passkey count from the
 * function, or a bridge factor. Any one of them means the typed code must stay.
 */
export const passkeysInUse = ({ hasBridge = false, passkeyCount = 0, passkeys = [] } = {}) =>
  Boolean(hasBridge) || passkeyCount > 0 || (Array.isArray(passkeys) && passkeys.length > 0);

/**
 * The guard (the bridge rule, also enforced by a database trigger): the last
 * authenticator app cannot be removed while passkeys are in use, so a typed
 * code always works.
 */
export const holdLastApp = (appCount, inUse) => Boolean(inUse) && appCount === 1;

/** The name a new authenticator app gets when the owner leaves the name empty (the classic rule). */
export const defaultAppName = (appCount) => (appCount === 0 ? PRIMARY_APP_NAME : `Backup authenticator ${appCount}`);

/**
 * Which screen the chapter shows.
 *   loading   the first read is in flight
 *   error     the authenticators could not be read
 *   first     no authenticator app and no passkey: first-time enrolment
 *   overview  everything else
 */
export function chapterState({ loading, error, appCount, inUse }) {
  if (loading) return 'loading';
  if (error) return 'error';
  if (appCount === 0 && !inUse) return 'first';
  return 'overview';
}

/** The sentence under "Authenticator apps", by how many there are. */
export function appsNote(appCount) {
  if (appCount > 1) return 'The six-digit code at sign-in. Any one of these apps works.';
  if (appCount === 1) return 'The six-digit code at sign-in. One app enrolled. A second one, on another device or in your password manager, is your way back in if this phone is lost.';
  return 'The six-digit code at sign-in.';
}

/** The reason a held Remove points at. */
export const HELD_REASON = 'Kept while you have passkeys, so a typed code always works. To replace this app, add the new one first; to remove it, remove the passkeys below.';

const nameOf = (app) => app?.friendly_name || 'Authenticator';
const quoted = (text) => `"${text}"`;

/** "your passkey", "both passkeys", "your 3 passkeys". */
const passkeyPhrase = (n) => (n === 1 ? 'your passkey' : n === 2 ? 'both passkeys' : `your ${n} passkeys`);

/**
 * The confirmation for removing an authenticator app, or null when the guard
 * holds it. Consequence first: what stops working, then what still works.
 * @returns {{kind: 'remove'|'remove-only-app', title: string, body: string, more?: string, confirm: string}|null}
 */
export function removeAppConfirm(app, apps, passkeyCount = 0, inUse = passkeyCount > 0) {
  const count = Array.isArray(apps) ? apps.length : 0;
  if (holdLastApp(count, inUse)) return null;
  if (count <= 1) {
    return {
      kind: 'remove-only-app',
      title: 'Remove your only authenticator?',
      body: 'Sign-in drops to one step until you add another app. Content changes are refused at that level, so the managers stop saving.',
      more: 'Add the replacement first if you are moving to a new phone.',
      confirm: 'Remove anyway',
    };
  }
  const others = apps.filter((a) => a.id !== app?.id);
  const parts = [others.length === 1 ? quoted(nameOf(others[0])) : `your other ${others.length} apps`];
  if (passkeyCount > 0) parts.push(passkeyPhrase(passkeyCount));
  const single = others.length === 1 && passkeyCount === 0;
  const still = parts.join(' and ');
  return {
    kind: 'remove',
    title: `Remove ${nameOf(app)}?`,
    body: `That app will stop working at sign-in. ${still.charAt(0).toUpperCase()}${still.slice(1)} still ${single ? 'works' : 'work'}.`,
    confirm: 'Remove app',
  };
}

/**
 * The confirmation for removing a passkey. The last one also switches passkey
 * sign-in off, and can lower this session if it was opened with that passkey.
 * @returns {{kind: 'remove-passkey'|'remove-last-passkey', title: string, body: string, confirm: string}}
 */
export function removePasskeyConfirm(passkey, passkeys) {
  const count = Array.isArray(passkeys) ? passkeys.length : 0;
  if (count <= 1) {
    return {
      kind: 'remove-last-passkey',
      title: 'Remove your last passkey?',
      body: 'Passkey sign-in switches off and every sign-in asks for the six-digit code. If this session was opened with that passkey, you may be asked for a code before the next save.',
      confirm: 'Remove passkey',
    };
  }
  return {
    kind: 'remove-passkey',
    title: `Remove ${passkey?.device_name || 'this passkey'}?`,
    body: 'That device will ask for the six-digit code at sign-in. Your other passkeys and the authenticator apps still work.',
    confirm: 'Remove passkey',
  };
}

const NY = 'America/New_York';

/** "Nov 9, 2026" in New York time; empty for a missing or broken date. */
export function formatDay(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: NY });
}

/** A setup key in groups of four, as authenticator apps print it. */
export const groupSecret = (secret) => String(secret || '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

// ---- this session ----

/** First-step methods the login offers, in the words the owner knows. Google is the only OAuth provider the login offers. */
const FIRST_STEP = { oauth: 'Google sign-in', otp: 'Email code', magiclink: 'Email code' };
const SECOND_STEP = new Set(['totp', 'mfa/totp']);

/**
 * How close (seconds) a passkey's last use must be to the second step's time
 * to say the step was that passkey. The passkey function stamps last_used_at
 * and completes the bridge factor in the same request, so the two sit within
 * a second or two; a typed code leaves no passkey use near its time.
 */
export const PASSKEY_MATCH_SECONDS = 120;

const ymdIn = (date) => date.toLocaleDateString('en-CA', { timeZone: NY });

/** "Today at 2:08 PM New York time", "Yesterday at ...", or "Nov 17 at ...". */
export function signedInText(date, now = new Date()) {
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: NY });
  const day = ymdIn(date);
  const today = ymdIn(now);
  const yesterday = ymdIn(new Date(now.getTime() - 86400000));
  const label = day === today ? 'Today' : day === yesterday ? 'Yesterday' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: NY });
  return `${label} at ${time} New York time`;
}

/** "just now", "12 min ago", "1 h 52 min ago", "3 days ago". */
export function agoText(date, now = new Date()) {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min ago` : `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/** "every hour", "every 30 minutes"; null when the lifetime is unknown. */
export function renewalText(expiresIn) {
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return null;
  if (expiresIn === 3600) return 'every hour';
  if (expiresIn % 3600 === 0) return `every ${expiresIn / 3600} hours`;
  return `every ${Math.max(1, Math.round(expiresIn / 60))} minutes`;
}

/**
 * The facts of the "This session" pane, each null when the inputs cannot
 * support it.
 * @param {{level: string, methods: Array<{method: string, timestamp: number|null}>, expiresIn: number|null}} session
 * @param {{passkeys?: Array<object>, now?: Date}} [context]
 * @returns {{passed: boolean, level: number, route: string|null, firstStep: string|null, signedIn: {text: string, ago: string}|null, renews: string|null}}
 */
export function describeSession(session, { passkeys = [], now = new Date() } = {}) {
  const methods = Array.isArray(session?.methods) ? session.methods : [];
  const passed = session?.level === 'aal2';
  const first = methods
    .filter((m) => FIRST_STEP[m.method])
    .sort((a, b) => (a.timestamp ?? Infinity) - (b.timestamp ?? Infinity))[0] || null;
  const second = methods.find((m) => SECOND_STEP.has(m.method)) || null;
  const firstStep = first ? FIRST_STEP[first.method] : null;

  let secondStep = null;
  if (passed && second) {
    const near = Number.isFinite(second.timestamp)
      ? (passkeys || []).find((p) => {
        const used = p?.last_used_at ? Date.parse(p.last_used_at) / 1000 : NaN;
        return Number.isFinite(used) && Math.abs(used - second.timestamp) <= PASSKEY_MATCH_SECONDS;
      })
      : null;
    secondStep = near ? `the passkey on ${quoted(near.device_name)}` : 'a six-digit code';
  }
  let route = null;
  if (firstStep && secondStep) route = `${firstStep}, then ${secondStep}`;
  else if (secondStep) route = `Second step: ${secondStep}`;
  else if (firstStep && !passed) route = `${firstStep} only`;

  const stamps = methods.map((m) => m.timestamp).filter(Number.isFinite);
  const startSeconds = first && Number.isFinite(first.timestamp) ? first.timestamp : stamps.length ? Math.min(...stamps) : null;
  const start = startSeconds === null ? null : new Date(startSeconds * 1000);

  return {
    passed,
    level: passed ? 2 : 1,
    route,
    firstStep,
    signedIn: start ? { text: signedInText(start, now), ago: agoText(start, now) } : null,
    renews: renewalText(session?.expiresIn),
  };
}

/** The note under a level 1 session: what it was signed in with, when that is known. */
export function levelOneNote(firstStep) {
  const how = { 'Google sign-in': 'Google', 'Email code': 'an email code' }[firstStep];
  return how ? `Assurance level 1: signed in with ${how} only.` : 'Assurance level 1: one step only.';
}

/**
 * "Desktop browser", "Phone browser" or "Tablet browser", from the user
 * agent; ", passkey available" or ", no passkey on this device" only when
 * the platform said so (platformAuthenticator true or false; null leaves it out).
 */
export function deviceText(nav = {}, platformAuthenticator = null) {
  const ua = String(nav?.userAgent || '');
  let kind = 'Desktop';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && Number(nav?.maxTouchPoints) > 1) || (/Android/.test(ua) && !/Mobile/.test(ua))) kind = 'Tablet';
  else if (nav?.userAgentData?.mobile || /iPhone|iPod|Mobile/.test(ua)) kind = 'Phone';
  const passkey = platformAuthenticator === true ? ', passkey available' : platformAuthenticator === false ? ', no passkey on this device' : '';
  return `${kind} browser${passkey}`;
}
