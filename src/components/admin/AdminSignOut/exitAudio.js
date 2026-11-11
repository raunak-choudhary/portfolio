// src/components/admin/AdminSignOut/exitAudio.js
//
// The sounds of the sign-out sequence, all synthesised with Web Audio so
// nothing is downloaded: the clap of the board, the beeps of the countdown
// (a louder pop on 2, as on a real leader), and a projector whir beneath
// the countdown. The sign-out click is the user gesture that lets audio
// start; if the browser still refuses, every call is a quiet no-op.

/**
 * @param {object} [options]
 * @param {boolean} [options.enabled] start muted or not.
 * @param {() => AudioContext} [options.createContext] injectable for tests.
 */
export function createExitAudio({ enabled = true, createContext } = {}) {
  let on = enabled, ctx = null, whir = null;
  const make = createContext || (() => { const Ctor = window.AudioContext || window.webkitAudioContext; return Ctor ? new Ctor() : null; });
  const context = () => {
    if (!on) return null;
    try {
      if (!ctx) ctx = make();
      if (ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
      return ctx;
    } catch { return null; }
  };
  const noise = (ac, seconds) => { const b = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * seconds)), ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; };

  return {
    /** The board snapping shut: a bandpassed noise burst with a low thud. */
    clap() {
      const ac = context(); if (!ac) return;
      try {
        const t = ac.currentTime;
        const n = ac.createBufferSource(); n.buffer = noise(ac, 0.25);
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.7;
        const g = ac.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        n.connect(bp).connect(g).connect(ac.destination); n.start(t);
        const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.18);
        const og = ac.createGain(); og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        o.connect(og).connect(ac.destination); o.start(t); o.stop(t + 0.22);
      } catch { /* audio is decoration */ }
    },
    /** A 1 kHz beep; `loud` for the pop on 2. */
    beep(loud = false) {
      const ac = context(); if (!ac) return;
      try {
        const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = 1000;
        g.gain.setValueAtTime(loud ? 0.35 : 0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + (loud ? 0.09 : 0.05));
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.1);
      } catch { /* audio is decoration */ }
    },
    /** Projector whir: filtered noise with a 24 Hz flutter, very quiet. */
    whirOn() {
      const ac = context(); if (!ac || whir) return;
      try {
        const n = ac.createBufferSource(); n.buffer = noise(ac, 2); n.loop = true;
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
        const g = ac.createGain(); g.gain.value = 0.05;
        const lfo = ac.createOscillator(); lfo.frequency.value = 24; const lg = ac.createGain(); lg.gain.value = 0.03;
        lfo.connect(lg).connect(g.gain); n.connect(lp).connect(g).connect(ac.destination); n.start(); lfo.start();
        whir = { n, lfo, g };
      } catch { whir = null; }
    },
    whirOff() {
      if (!whir || !ctx) { whir = null; return; }
      const w = whir; whir = null;
      try { w.g.gain.setTargetAtTime(0, ctx.currentTime, 0.15); setTimeout(() => { try { w.n.stop(); w.lfo.stop(); } catch { /* already stopped */ } }, 600); } catch { /* nothing to stop */ }
    },
    setEnabled(next) { on = !!next; if (!on) this.whirOff(); },
    get enabled() { return on; },
    dispose() { this.whirOff(); try { ctx?.close?.(); } catch { /* fine */ } ctx = null; },
  };
}
