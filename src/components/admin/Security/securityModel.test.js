// Unit tests for the security rules and wording behind the voyage's
// Security chapter.

import {
  HELD_REASON, PASSKEY_MATCH_SECONDS, PRIMARY_APP_NAME, agoText, appsNote, chapterState, defaultAppName, describeSession, deviceText,
  formatDay, groupSecret, levelOneNote, holdLastApp, isLocalhostPasskey, passkeysInUse, passkeyAddedText, removeAppConfirm, removePasskeyConfirm,
  renewalText, signedInText, tidyDeviceName,
} from './securityModel';

// authService loads the Supabase client; a stand-in client lets the real constant be read
jest.mock('../../../services/supabaseClient', () => ({ supabase: {} }));
const { PRIMARY_FACTOR_NAME } = jest.requireActual('../../../services/authService');

const app = (id, friendly_name) => ({ id, friendly_name, created_at: '2026-11-09T19:12:00Z' });
const key = (id, device_name, extra = {}) => ({ id, device_name, rp_id: 'www.raunakchoudhary.com', created_at: '2026-11-18T15:20:00Z', last_used_at: null, ...extra });

describe('the guard', () => {
  it('counts passkeys in use from rows, the function count or the bridge', () => {
    expect(passkeysInUse()).toBe(false);
    expect(passkeysInUse({ passkeys: [key('p1', 'Mac')] })).toBe(true);
    expect(passkeysInUse({ passkeyCount: 1 })).toBe(true);
    expect(passkeysInUse({ hasBridge: true })).toBe(true);
    expect(passkeysInUse({ hasBridge: false, passkeyCount: 0, passkeys: [] })).toBe(false);
  });

  it('holds the last app only while passkeys are in use', () => {
    expect(holdLastApp(1, true)).toBe(true);
    expect(holdLastApp(1, false)).toBe(false);
    expect(holdLastApp(2, true)).toBe(false);
    expect(holdLastApp(0, true)).toBe(false);
    expect(HELD_REASON).toMatch(/Kept while you have passkeys/);
  });

  it('names an unnamed app as the classic screen did', () => {
    expect(PRIMARY_APP_NAME).toBe(PRIMARY_FACTOR_NAME);
    expect(defaultAppName(0)).toBe('Primary authenticator');
    expect(defaultAppName(2)).toBe('Backup authenticator 2');
  });
});

describe('chapterState', () => {
  it('picks loading, error, first and overview in that order', () => {
    expect(chapterState({ loading: true, error: true, appCount: 0, inUse: false })).toBe('loading');
    expect(chapterState({ loading: false, error: true, appCount: 2, inUse: false })).toBe('error');
    expect(chapterState({ loading: false, error: false, appCount: 0, inUse: false })).toBe('first');
    // passkeys without an app (a broken state the trigger should prevent) still show the overview, so they can be removed
    expect(chapterState({ loading: false, error: false, appCount: 0, inUse: true })).toBe('overview');
    expect(chapterState({ loading: false, error: false, appCount: 1, inUse: true })).toBe('overview');
  });

  it('says how many apps work', () => {
    expect(appsNote(2)).toMatch(/Any one of these apps works/);
    expect(appsNote(1)).toMatch(/One app enrolled/);
    expect(appsNote(0)).toBe('The six-digit code at sign-in.');
  });
});

describe('confirmations', () => {
  const apps = [app('f1', 'iPhone 16 Pro, Google Authenticator'), app('f2', 'Backup: 1Password')];

  it('refuses to word a removal the guard holds', () => {
    expect(removeAppConfirm(apps[0], apps.slice(0, 1), 2)).toBeNull();
  });

  it('names what still works when one of several apps goes', () => {
    const c = removeAppConfirm(apps[1], apps, 2);
    expect(c).toEqual({ kind: 'remove', title: 'Remove Backup: 1Password?', body: 'That app will stop working at sign-in. "iPhone 16 Pro, Google Authenticator" and both passkeys still work.', confirm: 'Remove app' });
    expect(removeAppConfirm(apps[1], apps, 0).body).toBe('That app will stop working at sign-in. "iPhone 16 Pro, Google Authenticator" still works.');
    expect(removeAppConfirm(apps[0], [...apps, app('f3', 'iPad')], 1).body).toBe('That app will stop working at sign-in. Your other 2 apps and your passkey still work.');
    expect(removeAppConfirm(apps[0], apps, 3).body).toMatch(/and your 3 passkeys still work\.$/);
  });

  it('spells out the consequence of removing the only app', () => {
    const c = removeAppConfirm(apps[0], apps.slice(0, 1), 0);
    expect(c.kind).toBe('remove-only-app');
    expect(c.title).toBe('Remove your only authenticator?');
    expect(c.more).toBe('Add the replacement first if you are moving to a new phone.');
    expect(c.confirm).toBe('Remove anyway');
  });

  it('words the last passkey and any other passkey', () => {
    const p = [key('p1', 'MacBook Air (Touch ID)'), key('p2', 'Pixel 9')];
    expect(removePasskeyConfirm(p[0], p.slice(0, 1))).toMatchObject({ kind: 'remove-last-passkey', title: 'Remove your last passkey?', confirm: 'Remove passkey' });
    expect(removePasskeyConfirm(p[1], p)).toMatchObject({ kind: 'remove-passkey', title: 'Remove Pixel 9?' });
  });
});

describe('formatting', () => {
  it('marks localhost passkeys', () => {
    expect(isLocalhostPasskey(key('p', 'x', { rp_id: 'localhost' }))).toBe(true);
    expect(isLocalhostPasskey(key('p', 'x'))).toBe(false);
    expect(isLocalhostPasskey(null)).toBe(false);
  });

  it('prints days in New York time and groups setup keys', () => {
    expect(formatDay('2026-11-10T02:40:00Z')).toBe('Nov 9, 2026');
    expect(formatDay(null)).toBe('');
    expect(formatDay('not a date')).toBe('');
    expect(groupSecret('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
    expect(groupSecret('')).toBe('');
  });

  it('says when, in New York words', () => {
    const now = new Date('2026-11-18T21:00:00Z'); // 4:00 PM in New York
    expect(signedInText(new Date('2026-11-18T19:08:00Z'), now)).toBe('Today at 2:08 PM New York time');
    expect(signedInText(new Date('2026-11-17T19:08:00Z'), now)).toBe('Yesterday at 2:08 PM New York time');
    expect(signedInText(new Date('2026-11-12T19:08:00Z'), now)).toBe('Nov 12 at 2:08 PM New York time');
    expect(agoText(new Date('2026-11-18T19:08:00Z'), now)).toBe('1 h 52 min ago');
    expect(agoText(new Date('2026-11-18T20:59:40Z'), now)).toBe('just now');
    expect(agoText(new Date('2026-11-18T20:48:00Z'), now)).toBe('12 min ago');
    expect(agoText(new Date('2026-11-18T19:00:00Z'), now)).toBe('2 h ago');
    expect(agoText(new Date('2026-11-16T19:00:00Z'), now)).toBe('2 days ago');
    expect(agoText(new Date('2026-11-17T19:00:00Z'), now)).toBe('1 day ago');
  });

  it('says what a level 1 session was signed in with', () => {
    expect(levelOneNote('Google sign-in')).toBe('Assurance level 1: signed in with Google only.');
    expect(levelOneNote('Email code')).toBe('Assurance level 1: signed in with an email code only.');
    expect(levelOneNote(null)).toBe('Assurance level 1: one step only.');
  });

  it('says what the next sign-in asks for after a passkey is saved', () => {
    expect(passkeyAddedText('Studio iMac (Touch ID)', 'mac')).toBe('Passkey saved for "Studio iMac (Touch ID)". Next sign-in on this Mac asks for Touch ID.');
    expect(passkeyAddedText('iPhone', 'ios')).toMatch(/asks for Face ID\.$/);
    expect(passkeyAddedText('Pixel', 'android')).toMatch(/fingerprint or screen lock\.$/);
    expect(passkeyAddedText('PC', 'other')).toMatch(/asks for your passkey\.$/);
    expect(tidyDeviceName('  Studio   iMac ')).toBe('Studio iMac');
    expect(tidyDeviceName(null)).toBe('');
  });

  it('words the renewal only when the lifetime is known', () => {
    expect(renewalText(3600)).toBe('every hour');
    expect(renewalText(7200)).toBe('every 2 hours');
    expect(renewalText(1800)).toBe('every 30 minutes');
    expect(renewalText(null)).toBeNull();
    expect(renewalText(0)).toBeNull();
  });

  it('names the device class and passkey support only when known', () => {
    const mac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 };
    expect(deviceText(mac, true)).toBe('Desktop browser, passkey available');
    expect(deviceText(mac, false)).toBe('Desktop browser, no passkey on this device');
    expect(deviceText(mac, null)).toBe('Desktop browser');
    expect(deviceText({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile' })).toBe('Phone browser');
    expect(deviceText({ userAgent: 'Mozilla/5.0 (Macintosh)', maxTouchPoints: 5 })).toBe('Tablet browser');
    expect(deviceText({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile' })).toBe('Phone browser');
    expect(deviceText({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Tab)' })).toBe('Tablet browser');
    expect(deviceText({ userAgent: 'x', userAgentData: { mobile: true } })).toBe('Phone browser');
    expect(deviceText()).toBe('Desktop browser');
  });
});

describe('describeSession', () => {
  const now = new Date('2026-11-18T21:00:00Z');
  const t = (iso) => Date.parse(iso) / 1000;

  it('reads Google then a typed code at level 2', () => {
    const s = describeSession({ level: 'aal2', methods: [{ method: 'totp', timestamp: t('2026-11-18T19:09:00Z') }, { method: 'oauth', timestamp: t('2026-11-18T19:08:00Z') }], expiresIn: 3600 }, { now });
    expect(s).toEqual({ passed: true, level: 2, route: 'Google sign-in, then a six-digit code', firstStep: 'Google sign-in', signedIn: { text: 'Today at 2:08 PM New York time', ago: '1 h 52 min ago' }, renews: 'every hour' });
  });

  it('names the passkey whose last use matches the second step', () => {
    const second = t('2026-11-18T19:09:00Z');
    const passkeys = [
      { device_name: 'Pixel 9', last_used_at: '2026-11-17T10:00:00Z' },
      { device_name: 'MacBook Air (Touch ID)', last_used_at: new Date((second - 1) * 1000).toISOString() },
    ];
    const s = describeSession({ level: 'aal2', methods: [{ method: 'oauth', timestamp: t('2026-11-18T19:08:00Z') }, { method: 'mfa/totp', timestamp: second }] }, { passkeys, now });
    expect(s.route).toBe('Google sign-in, then the passkey on "MacBook Air (Touch ID)"');
    // just outside the window: a typed code
    const far = [{ device_name: 'Mac', last_used_at: new Date((second - PASSKEY_MATCH_SECONDS - 5) * 1000).toISOString() }];
    expect(describeSession({ level: 'aal2', methods: [{ method: 'totp', timestamp: second }] }, { passkeys: far, now }).route).toBe('Second step: a six-digit code');
  });

  it('says one step only at level 1 and leaves unknowns out', () => {
    const s = describeSession({ level: 'aal1', methods: [{ method: 'otp', timestamp: t('2026-11-18T19:08:00Z') }], expiresIn: null }, { now });
    expect(s).toMatchObject({ passed: false, level: 1, route: 'Email code only', firstStep: 'Email code', renews: null });
    const bare = describeSession({ level: 'aal1', methods: [{ method: 'otp', timestamp: null }] }, { now });
    expect(bare.signedIn).toBeNull();
    expect(describeSession(null, { now })).toMatchObject({ passed: false, route: null, signedIn: null, renews: null });
    // a method the login does not offer gives no route, but its time still dates the sign-in
    const odd = describeSession({ level: 'aal1', methods: [{ method: 'password', timestamp: t('2026-11-18T20:00:00Z') }] }, { now });
    expect(odd.route).toBeNull();
    expect(odd.signedIn.ago).toBe('1 h ago');
  });
});
