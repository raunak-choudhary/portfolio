// src/components/admin/AdminWelcome/matrixVoice.js
//
// Plays the entry's spoken lines. Each line is a short recording served from
// the site itself (public/admin/voice); Web Audio gives it the calm, slightly
// roomy "Jarvis" treatment settled on 2026-11-10: speed 0.96, a low-pass at
// 7 kHz and a short echo. Browsers allow sound only after a user gesture; the
// login submit is that gesture, and a blocked or failed clip is ignored.

const SETTINGS = Object.freeze({ rate: 0.96, lowpassHz: 7000, echoSeconds: 0.09, echoFeedback: 0.08, gain: 0.9 });

export const clipUrlFor = (line) => `${process.env.PUBLIC_URL || ''}/admin/voice/line-${line}.m4a`;

/**
 * Creates a player bound to one AudioContext. `isMuted` is read at play time
 * so the speaker toggle takes effect immediately.
 */
export const createVoicePlayer = ({ isMuted = () => false, fetchImpl = (...args) => fetch(...args) } = {}) => {
  let context = null;
  const clips = new Map();

  const ensureContext = async () => {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    context = context || new Ctor();
    if (context.state === 'suspended') await context.resume();
    return context;
  };

  const loadClip = async (ctx, line) => {
    if (!clips.has(line)) {
      const response = await fetchImpl(clipUrlFor(line));
      if (!response.ok) throw new Error(`clip ${line}: ${response.status}`);
      clips.set(line, await ctx.decodeAudioData(await response.arrayBuffer()));
    }
    return clips.get(line);
  };

  const play = async (line) => {
    if (isMuted()) return false;
    try {
      const ctx = await ensureContext();
      if (!ctx || ctx.state !== 'running') return false;
      const buffer = await loadClip(ctx, line);
      if (isMuted()) return false;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = SETTINGS.rate;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = SETTINGS.lowpassHz;
      const master = ctx.createGain();
      master.gain.value = SETTINGS.gain;
      const delay = ctx.createDelay(1);
      delay.delayTime.value = SETTINGS.echoSeconds;
      const feedback = ctx.createGain();
      feedback.gain.value = SETTINGS.echoFeedback;
      source.connect(lowpass);
      lowpass.connect(master);
      lowpass.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(master);
      master.connect(ctx.destination);
      source.start();
      return true;
    } catch (error) {
      // Sound is optional: never let it affect the entry.
      return false;
    }
  };

  const dispose = () => { try { context?.close(); } catch { /* already closed */ } context = null; clips.clear(); };

  return { play, dispose };
};
