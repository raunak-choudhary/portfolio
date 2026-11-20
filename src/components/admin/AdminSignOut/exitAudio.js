// src/components/admin/AdminSignOut/exitAudio.js
//
// The sounds of the sign-out sequence, all synthesised with Web Audio so
// nothing is downloaded: the clap of the board, the beeps of the countdown
// (a louder pop on 2, as on a real leader), and a projector whir beneath
// the countdown. Browsers allow sound only after a user gesture. Chrome
// carries the sign-out click over to this page; a reload, a direct visit and
// other browsers do not, so the page calls `unlock()` from its first click
// or key. Until sound is allowed every call is a quiet no-op, and no
// AudioContext is created (creating one early logs a console warning).
//
// A sound is only ever scheduled on a running context. A context that is
// still suspended (every new one is, for a moment; in Safari until a gesture)
// has a frozen clock: whatever is scheduled on it piles up at the same
// instant and plays all at once when it resumes. So a one-shot sound waits
// briefly for the resume and is dropped if that takes longer than the sound
// would still be in time; the whir, a state not an event, starts when the
// context runs if it is still wanted.

/**
 * @param {object} [options]
 * @param {boolean} [options.enabled] start muted or not.
 * @param {boolean} [options.eager] true when the page was reached by a click, so sound may start at once.
 * @param {() => AudioContext} [options.createContext] injectable for tests.
 * @param {() => number} [options.now] millisecond clock, injectable for tests.
 */
/** How late a clap or beep may still play after it was asked for; later than this it is dropped. */
const ONE_SHOT_PATIENCE_MS = 250;

export function createExitAudio({ enabled = true, eager = true, createContext, now = () => Date.now() } = {}) {
  let on = enabled, allowed = eager, ctx = null, whir = null, whirWanted = false;
  const make = createContext || (() => { const Ctor = window.AudioContext || window.webkitAudioContext; return Ctor ? new Ctor() : null; });
  const context = () => {
    if (!on || !allowed) return null;
    try {
      if (!ctx) ctx = make();
      return ctx;
    } catch { return null; }
  };
  const running = (ac) => !ac.state || ac.state === 'running';
  /**
   * Runs `play` on a running context. If the context is suspended it is asked
   * to resume, and `play` runs only if that happens within `patience` ms.
   */
  const whenRunning = (play, patience = ONE_SHOT_PATIENCE_MS) => {
    const ac = context(); if (!ac) return;
    if (running(ac)) { play(ac); return; }
    if (!ac.resume) return;
    const asked = now();
    try {
      Promise.resolve(ac.resume()).then(() => { if (ctx === ac && on && running(ac) && now() - asked <= patience) play(ac); }).catch(() => {});
    } catch { /* audio is decoration */ }
  };
  const startWhir = (ac) => {
    if (whir || !whirWanted) return;
    try {
      const n = ac.createBufferSource(); n.buffer = noise(ac, 2); n.loop = true;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const g = ac.createGain(); g.gain.value = 0.05;
      const lfo = ac.createOscillator(); lfo.frequency.value = 24; const lg = ac.createGain(); lg.gain.value = 0.03;
      lfo.connect(lg).connect(g.gain); n.connect(lp).connect(g).connect(ac.destination); n.start(); lfo.start();
      whir = { n, lfo, g };
    } catch { whir = null; }
  };
  const noise = (ac, seconds) => { const b = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * seconds)), ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; };

  return {
    /** The board snapping shut: a bandpassed noise burst with a low thud. */
    clap() {
      whenRunning((ac) => { try {
        const t = ac.currentTime;
        const n = ac.createBufferSource(); n.buffer = noise(ac, 0.25);
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.7;
        const g = ac.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        n.connect(bp).connect(g).connect(ac.destination); n.start(t);
        const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.18);
        const og = ac.createGain(); og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        o.connect(og).connect(ac.destination); o.start(t); o.stop(t + 0.22);
      } catch { /* audio is decoration */ } });
    },
    /** A 1 kHz beep; `loud` for the pop on 2. */
    beep(loud = false) {
      whenRunning((ac) => { try {
        const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = 1000;
        g.gain.setValueAtTime(loud ? 0.35 : 0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + (loud ? 0.09 : 0.05));
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.1);
      } catch { /* audio is decoration */ } });
    },
    /** Projector whir: filtered noise with a 24 Hz flutter, very quiet. */
    whirOn() {
      whirWanted = true;
      // no time limit: the whir starts whenever the context runs, if it is still wanted then
      whenRunning(startWhir, Infinity);
    },
    whirOff() {
      whirWanted = false;
      if (!whir || !ctx) { whir = null; return; }
      const w = whir; whir = null;
      try { w.g.gain.setTargetAtTime(0, ctx.currentTime, 0.15); setTimeout(() => { try { w.n.stop(); w.lfo.stop(); } catch { /* already stopped */ } }, 600); } catch { /* nothing to stop */ }
    },
    /** Called from a click or key on the page: sound is allowed from now on, and a suspended context resumes. */
    unlock() { allowed = true; if (whirWanted) whenRunning(startWhir, Infinity); else whenRunning(() => {}); },
    setEnabled(next) { on = !!next; if (!on) this.whirOff(); },
    get enabled() { return on; },
    dispose() { this.whirOff(); try { ctx?.close?.(); } catch { /* fine */ } ctx = null; },
  };
}
