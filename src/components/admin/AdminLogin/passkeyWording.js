// src/components/admin/AdminLogin/passkeyWording.js
//
// The words on step 02's passkey row, by device. WebAuthn never says which
// authenticator will answer (a phone, a password manager or a security key
// can all hold the passkey), so the label is a best guess from the user
// agent and the hint underneath keeps it honest. Pure, so every platform
// is unit tested with a stand-in navigator.

/** Device families the row can name. */
export const PASSKEY_DEVICE = Object.freeze({
  MAC: 'mac',
  IOS: 'ios',
  ANDROID: 'android',
  OTHER: 'other'
});

const WORDING = Object.freeze({
  [PASSKEY_DEVICE.MAC]: Object.freeze({
    label: 'Unlock with Touch ID',
    hint: 'Passkey saved on this Mac',
    waiting: 'Waiting for Touch ID',
    waitingHint: 'Touch the sensor to continue.',
    accepted: 'Touch ID accepted',
    back: 'Use Touch ID instead'
  }),
  [PASSKEY_DEVICE.IOS]: Object.freeze({
    label: 'Unlock with Face ID',
    hint: 'Passkey saved on this device',
    waiting: 'Waiting for Face ID',
    waitingHint: 'Look at the screen to continue.',
    accepted: 'Face ID accepted',
    back: 'Use Face ID instead'
  }),
  [PASSKEY_DEVICE.ANDROID]: Object.freeze({
    label: 'Unlock with fingerprint',
    hint: 'Passkey on this phone. Screen lock works too.',
    waiting: 'Waiting for fingerprint',
    waitingHint: 'Touch the sensor, or use your screen lock.',
    accepted: 'Fingerprint accepted',
    back: 'Use fingerprint instead'
  }),
  [PASSKEY_DEVICE.OTHER]: Object.freeze({
    label: 'Unlock with passkey',
    hint: 'Your device asks how to confirm it is you',
    waiting: 'Waiting for your passkey',
    waitingHint: 'Follow the prompt on this device.',
    accepted: 'Passkey accepted',
    back: 'Use passkey instead'
  })
});

/**
 * Which device family a navigator belongs to. iPadOS reports itself as a
 * Mac, so a "Macintosh" with a touch screen counts as iOS. Android is
 * checked before anything else because some Android browsers also mention
 * Linux or Mac-like tokens.
 * @param {{userAgent?: string, platform?: string, maxTouchPoints?: number, userAgentData?: {platform?: string}}} [nav]
 * @returns {'mac'|'ios'|'android'|'other'}
 */
export function detectPasskeyDevice(nav = typeof navigator !== 'undefined' ? navigator : {}) {
  const ua = String(nav?.userAgent || '');
  const platform = String(nav?.userAgentData?.platform || nav?.platform || '');
  if (/Android/i.test(ua) || /Android/i.test(platform)) return PASSKEY_DEVICE.ANDROID;
  if (/iPhone|iPad|iPod/.test(ua) || /^(iPhone|iPad|iPod)/.test(platform)) return PASSKEY_DEVICE.IOS;
  const macLike = /Macintosh/.test(ua) || /^Mac/i.test(platform) || /macOS/i.test(platform);
  if (macLike) return Number(nav?.maxTouchPoints) > 1 ? PASSKEY_DEVICE.IOS : PASSKEY_DEVICE.MAC;
  return PASSKEY_DEVICE.OTHER;
}

/**
 * The row's words for a navigator: label, hint, the waiting pair, the
 * summary shown once accepted, and the link back from code mode.
 */
export function passkeyWording(nav) {
  return WORDING[detectPasskeyDevice(nav)];
}
