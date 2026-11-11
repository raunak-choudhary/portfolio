import { clipUrlFor, createVoicePlayer } from './matrixVoice';

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
});
