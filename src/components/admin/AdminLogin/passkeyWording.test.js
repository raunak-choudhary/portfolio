// Step 02's passkey wording by device: the guess from the user agent and
// the words that go with it.

import { PASSKEY_DEVICE, detectPasskeyDevice, passkeyWording } from './passkeyWording';

const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPAD_OLD = 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1';
const SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

describe('detectPasskeyDevice', () => {
  it('names a Mac in Safari and in Chrome', () => {
    expect(detectPasskeyDevice({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(PASSKEY_DEVICE.MAC);
    expect(detectPasskeyDevice({ userAgent: MAC_CHROME, userAgentData: { platform: 'macOS' } })).toBe(PASSKEY_DEVICE.MAC);
  });

  it('names an iPhone, an older iPad, and an iPad that reports itself as a Mac', () => {
    expect(detectPasskeyDevice({ userAgent: IPHONE, platform: 'iPhone' })).toBe(PASSKEY_DEVICE.IOS);
    expect(detectPasskeyDevice({ userAgent: IPAD_OLD, platform: 'iPad' })).toBe(PASSKEY_DEVICE.IOS);
    expect(detectPasskeyDevice({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(PASSKEY_DEVICE.IOS);
  });

  it('names Android, Samsung Internet included', () => {
    expect(detectPasskeyDevice({ userAgent: SAMSUNG, platform: 'Linux armv8l' })).toBe(PASSKEY_DEVICE.ANDROID);
    expect(detectPasskeyDevice({ userAgent: LINUX, userAgentData: { platform: 'Android' } })).toBe(PASSKEY_DEVICE.ANDROID);
  });

  it('falls back to other for Windows, Linux and anything unknown', () => {
    expect(detectPasskeyDevice({ userAgent: WINDOWS, platform: 'Win32' })).toBe(PASSKEY_DEVICE.OTHER);
    expect(detectPasskeyDevice({ userAgent: LINUX, platform: 'Linux x86_64' })).toBe(PASSKEY_DEVICE.OTHER);
    expect(detectPasskeyDevice({})).toBe(PASSKEY_DEVICE.OTHER);
    expect(detectPasskeyDevice(null)).toBe(PASSKEY_DEVICE.OTHER);
  });
});

describe('passkeyWording', () => {
  it('says Touch ID on a Mac', () => {
    const words = passkeyWording({ userAgent: MAC_SAFARI, platform: 'MacIntel' });
    expect(words.label).toBe('Unlock with Touch ID');
    expect(words.waiting).toBe('Waiting for Touch ID');
    expect(words.accepted).toBe('Touch ID accepted');
    expect(words.back).toBe('Use Touch ID instead');
  });

  it('says Face ID on an iPhone and an iPad', () => {
    expect(passkeyWording({ userAgent: IPHONE }).label).toBe('Unlock with Face ID');
    expect(passkeyWording({ userAgent: MAC_SAFARI, maxTouchPoints: 5 }).label).toBe('Unlock with Face ID');
  });

  it('says fingerprint on Android and mentions the screen lock', () => {
    const words = passkeyWording({ userAgent: SAMSUNG });
    expect(words.label).toBe('Unlock with fingerprint');
    expect(words.hint).toBe('Passkey on this phone. Screen lock works too.');
  });

  it('says passkey anywhere else', () => {
    const words = passkeyWording({ userAgent: WINDOWS });
    expect(words.label).toBe('Unlock with passkey');
    expect(words.accepted).toBe('Passkey accepted');
  });

  it('gives every family the same set of words, none empty', () => {
    const keys = ['label', 'hint', 'waiting', 'waitingHint', 'accepted', 'back'];
    for (const ua of [MAC_SAFARI, IPHONE, SAMSUNG, WINDOWS]) {
      const words = passkeyWording({ userAgent: ua });
      expect(Object.keys(words).sort()).toEqual([...keys].sort());
      keys.forEach((key) => expect(words[key].length).toBeGreaterThan(0));
    }
  });
});
