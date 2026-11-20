import { RESUME_WAIT_MS, canStartAudio, clipUrlFor, createVoicePlayer } from './matrixVoice';

/** Minimal AudioContext stand-in that records what was connected and started. */
const fakeAudioContext = (state = 'running') => {
  const node = () => ({ connect: jest.fn(), gain: { value: 0 }, frequency: { value: 0 }, delayTime: { value: 0 }, playbackRate: { value: 1 }, start: jest.fn() });
  const started = [];
  const ctx = {
    state,
    resume: jest.fn(async () => { ctx.state = 'running'; }),
    close: jest.fn(),
    destination: {},
    decodeAudioData: jest.fn(async () => ({ duration: 1 })),
    createBufferSource: () => { const n = node(); n.start = jest.fn(() => started.push(n)); return n; },
    createBiquadFilter: node,
    createGain: node,
    createDelay: node,
  };
  return { ctx, started };
};

describe('matrixVoice', () => {
  const okResponse = { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };

  afterEach(() => { delete window.AudioContext; });

  it('builds clip URLs under the site\'s own admin folder', () => {
    expect(clipUrlFor('welcome')).toBe('/admin/voice/line-welcome.m4a');
  });

  it('plays a clip once the context is running and caches the decoded buffer', async () => {
    const { ctx, started } = fakeAudioContext('suspended');
    window.AudioContext = jest.fn(() => ctx);
    const fetchImpl = jest.fn(async () => okResponse);
    const player = createVoicePlayer({ fetchImpl });
    expect(await player.play('welcome')).toBe(true);
    expect(await player.play('welcome')).toBe(true);
    expect(ctx.resume).toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(started).toHaveLength(2);
  });

  it('stays silent when muted, when the browser blocks audio, or when the clip is missing', async () => {
    const blocked = fakeAudioContext('suspended');
    blocked.ctx.resume = jest.fn(async () => {});   // the browser keeps it suspended: no gesture yet
    window.AudioContext = jest.fn(() => blocked.ctx);
    const fetchImpl = jest.fn(async () => okResponse);
    expect(await createVoicePlayer({ isMuted: () => true, fetchImpl }).play('welcome')).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await createVoicePlayer({ fetchImpl }).play('welcome')).toBe(false);

    const { ctx } = fakeAudioContext();
    window.AudioContext = jest.fn(() => ctx);
    expect(await createVoicePlayer({ fetchImpl: async () => ({ ok: false, status: 404 }) }).play('knock')).toBe(false);
  });

  it('does nothing without Web Audio support', async () => {
    expect(await createVoicePlayer({ fetchImpl: jest.fn() }).play('welcome')).toBe(false);
  });

  describe('without a gesture on the page', () => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, 'userActivation');
    const setActivation = (value) => Object.defineProperty(window.navigator, 'userActivation', { configurable: true, value });
    afterEach(() => { if (original) Object.defineProperty(window.navigator, 'userActivation', original); else delete window.navigator.userActivation; });

    it('creates no AudioContext, so the browser has nothing to warn about', async () => {
      setActivation({ hasBeenActive: false });
      const { ctx } = fakeAudioContext();
      window.AudioContext = jest.fn(() => ctx);
      const fetchImpl = jest.fn(async () => okResponse);
      expect(await createVoicePlayer({ fetchImpl }).play('welcome')).toBe(false);
      expect(window.AudioContext).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('plays once the page has been clicked', async () => {
      setActivation({ hasBeenActive: true });
      const { ctx, started } = fakeAudioContext();
      window.AudioContext = jest.fn(() => ctx);
      expect(await createVoicePlayer({ fetchImpl: jest.fn(async () => okResponse) }).play('welcome')).toBe(true);
      expect(started).toHaveLength(1);
    });

    it('canStartAudio trusts browsers that cannot say', () => {
      expect(canStartAudio({})).toBe(true);
      expect(canStartAudio({ userActivation: { hasBeenActive: false } })).toBe(false);
    });
  });

  it('skips the line when a suspended context does not resume in time, instead of speaking late', async () => {
    jest.useFakeTimers();
    try {
      const { ctx, started } = fakeAudioContext('suspended');
      ctx.resume = jest.fn(() => new Promise(() => {}));   // pending until some later click
      window.AudioContext = jest.fn(() => ctx);
      const playing = createVoicePlayer({ fetchImpl: jest.fn(async () => okResponse) }).play('welcome');
      await Promise.resolve();
      jest.advanceTimersByTime(RESUME_WAIT_MS + 10);
      expect(await playing).toBe(false);
      expect(started).toHaveLength(0);
    } finally { jest.useRealTimers(); }
  });
});
