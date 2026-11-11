// src/components/admin/AdminWelcome/MatrixEntry.js
//
// The admin entry screen (design locked by the owner, 2026-11-10): digital
// rain on a canvas, the greeting resolving glyph by glyph, true status lines,
// a white rabbit crossing the bottom edge, two pills (blue skips, red replays)
// and a speaker toggle. It draws over a dashboard that is already rendering
// underneath and lifts when the sequence ends and the dashboard has reported
// its first data (or after a hard cap).
//
// Security notes: all text is set through DOM text nodes, never HTML; the
// facts shown come from the caller; assets load from this origin only; the
// screen gates nothing, the protected route already did.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CAUGHT_LINE,
  GLYPHS,
  INITIALS,
  TIMELINE,
  VOICE_LINES,
  buildStatusLines,
  bumpRabbitTally,
  decodeFrame,
  isInitialsColumn,
  pickGreeting,
  readMuted,
  readRabbitTally,
  writeMuted,
} from './entryModel';
import { createVoicePlayer } from './matrixVoice';
import { onDashboardReady } from './adminReadiness';
import './MatrixEntry.css';

const RABBIT_SRC = `${process.env.PUBLIC_URL || ''}/admin/rabbit.png`;
const randGlyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

/** Renders a decode frame into an element as text nodes and spans, never as HTML. */
const paintDecode = (el, frame) => {
  el.textContent = '';
  for (const { ch, pending } of frame) {
    if (ch === ' ') { el.appendChild(document.createTextNode(' ')); continue; }
    if (!pending) { el.appendChild(document.createTextNode(ch)); continue; }
    const span = document.createElement('span');
    span.className = 'matrix-entry__pending';
    span.textContent = ch;
    el.appendChild(span);
  }
};

const MatrixEntry = ({ facts, onDone }) => {
  const rainRef = useRef(null);
  const fxRef = useRef(null);
  const titleRef = useRef(null);
  const linesRef = useRef(null);
  const textRef = useRef(null);
  const rootRef = useRef(null);
  const [muted, setMuted] = useState(() => readMuted());
  const [controlsOn, setControlsOn] = useState(false);
  const [rabbitActive, setRabbitActive] = useState(false);
  const [run, setRun] = useState(0);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const doneRef = useRef(false);
  // The latest facts and callback are read through refs: counts arrive while the
  // rain is falling, and that must update the status lines, not restart the run.
  const factsRef = useRef(facts);
  factsRef.current = facts;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const skipRef = useRef(() => {});

  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current?.();
  }, []);

  useEffect(() => {
    doneRef.current = false;
    const root = rootRef.current, rain = rainRef.current, fx = fxRef.current, titleEl = titleRef.current, linesEl = linesRef.current, textEl = textRef.current;
    if (!root || !rain || !fx || !titleEl || !linesEl || !textEl) return undefined;
    root.classList.remove('is-lifting'); textEl.classList.remove('is-fading');
    titleEl.textContent = ''; linesEl.textContent = '';
    setControlsOn(false); setRabbitActive(false);

    const timers = [];
    const after = (ms, fn) => timers.push(setTimeout(fn, ms));
    const voice = createVoicePlayer({ isMuted: () => mutedRef.current });
    const greeting = pickGreeting();
    const now = new Date();
    let rabbits = readRabbitTally();
    const statusLines = () => buildStatusLines({ now, rabbits, ...factsRef.current });

    // Dashboard readiness: the drain waits for it, up to the cap.
    let dashboardReady = false;
    const unsubscribe = onDashboardReady(() => { dashboardReady = true; });
    const readyCapAt = performance.now() + TIMELINE.readyCapMs;

    const lift = () => { textEl.classList.add('is-fading'); root.classList.add('is-lifting'); };

    if (reducedMotion) {
      titleEl.textContent = greeting;
      statusLines().forEach((text) => { const div = document.createElement('div'); div.className = 'matrix-entry__line'; div.textContent = text; linesEl.appendChild(div); });
      after(120, () => voice.play(VOICE_LINES[greeting]));
      after(TIMELINE.reducedMotionMs - 400, lift);
      after(TIMELINE.reducedMotionMs + 500, finish);
      return () => { timers.forEach(clearTimeout); unsubscribe(); voice.dispose(); };
    }

    // ----- rain -----
    const ctx = rain.getContext('2d'), fxCtx = fx.getContext('2d');
    let W = 0, H = 0, fontSize = 18, rows = 0, columns = [];
    const newDrop = (initial) => ({ y: initial ? -Math.random() * rows * 2.2 : -Math.random() * rows * 0.6, speed: 6 + Math.random() * 10, step: 0, last: -1 });
    const newColumn = (i) => ({ x: i * fontSize, mirror: Math.random() < 0.5, initials: isInitialsColumn(i), drops: [newDrop(true), newDrop(true)] });
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      for (const c of [rain, fx]) { c.width = Math.floor(W * dpr); c.height = Math.floor(H * dpr); c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0); }
      fontSize = Math.max(14, Math.min(20, Math.round(W / 70)));
      rows = Math.ceil(H / fontSize);
      ctx.font = `${fontSize}px ui-monospace, Menlo, "SF Mono", Consolas, monospace`;
      ctx.textBaseline = 'top';
      columns = Array.from({ length: Math.ceil(W / fontSize) }, (_, i) => newColumn(i));
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    };
    const drawGlyph = (g, x, y, color, mirror) => {
      ctx.fillStyle = color;
      if (mirror) { ctx.save(); ctx.translate(x + fontSize, y); ctx.scale(-1, 1); ctx.fillText(g, 0, 0); ctx.restore(); } else ctx.fillText(g, x, y);
    };

    // ----- rabbit -----
    const rabbitImg = new Image();
    let rabbitLoaded = false;
    rabbitImg.onload = () => { rabbitLoaded = true; };
    rabbitImg.src = RABBIT_SRC;
    let rabbit = null, rabbitShown = false, rabbitProgress = 0, rabbitLastT = 0, caught = false, pauseUntil = 0, whiteUntil = 0;
    const timeline = { ...TIMELINE };

    const drawRabbit = (t) => {
      if (!rabbitLoaded) { rabbit = null; return; }
      const paused = performance.now() < pauseUntil;
      if (rabbitLastT && !paused) rabbitProgress += (t - rabbitLastT) / timeline.rabbitMs;
      rabbitLastT = t;
      const p = Math.min(1, rabbitProgress);
      const h = Math.round(Math.max(56, Math.min(96, H * 0.09)));
      const w = Math.round(h * rabbitImg.naturalWidth / rabbitImg.naturalHeight);
      const x = -w + p * (W + 2 * w);
      const hop = paused ? 0 : Math.abs(Math.sin(p * Math.PI * 8)) * 12;
      const y = H - h - 8 - hop;
      rabbit.box = { x, y, w, h };
      fxCtx.save();
      fxCtx.shadowColor = 'rgba(255,255,255,0.35)'; fxCtx.shadowBlur = paused ? 22 + 10 * Math.sin(t / 150) : 14;
      fxCtx.translate(x + w / 2, y + h);
      const stretch = paused ? 1 : 1 + 0.06 * Math.sin(p * Math.PI * 8);
      const notice = paused ? 1.18 + 0.04 * Math.sin(t / 120) : 1;
      fxCtx.scale(notice / stretch, notice * stretch);
      fxCtx.drawImage(rabbitImg, -w / 2, -h, w, h);
      fxCtx.restore();
      if (p >= 1) { rabbit = null; setRabbitActive(false); }
    };

    const catchRabbit = () => {
      if (caught || !rabbit) return;
      caught = true;
      rabbits = bumpRabbitTally();
      pauseUntil = performance.now() + timeline.caughtPauseMs;
      whiteUntil = performance.now() + 1300;
      decodeInto(titleEl, CAUGHT_LINE, 600);
      voice.play(VOICE_LINES[CAUGHT_LINE]);
      const existing = linesEl.querySelector('[data-rabbits]');
      const line = existing || document.createElement('div');
      line.className = 'matrix-entry__line'; line.dataset.rabbits = '1'; line.textContent = `WHITE RABBITS FOLLOWED · ${rabbits}`;
      if (!existing) linesEl.appendChild(line);
      timeline.drainStart += timeline.caughtPauseMs;
    };

    // ----- text -----
    let running = true;
    const decodeInto = (el, target, ms, done) => {
      const start = performance.now();
      const tick = () => {
        if (!running) return;
        const progress = Math.min(1, (performance.now() - start) / ms);
        paintDecode(el, decodeFrame(target, progress));
        if (progress < 1) requestAnimationFrame(tick); else done?.();
      };
      tick();
    };
    const runLines = () => {
      statusLines().forEach((text, i) => {
        const div = document.createElement('div');
        div.className = 'matrix-entry__line';
        if (text.startsWith('WHITE RABBITS')) div.dataset.rabbits = '1';
        linesEl.appendChild(div);
        after(i * TIMELINE.lineGap, () => decodeInto(div, text, TIMELINE.lineMs));
      });
    };
    const showJumpProgram = () => {
      if (linesEl.querySelector('[data-jump]')) return;
      const div = document.createElement('div');
      div.className = 'matrix-entry__line matrix-entry__line--jump'; div.dataset.jump = '1'; div.textContent = 'LOADING JUMP PROGRAM...';
      linesEl.appendChild(div);
    };

    // ----- loop -----
    let draining = false, liftAt = 0, prev = 0, raf = 0;
    const startAt = performance.now();
    const loop = (nowMs) => {
      if (!running) return;
      const t = nowMs - startAt;
      const dt = Math.min(0.05, prev ? (nowMs - prev) / 1000 : 0); prev = nowMs;
      if (t >= timeline.rabbitStart && !rabbit && !rabbitShown) { rabbit = { box: null }; rabbitShown = true; rabbitProgress = 0; rabbitLastT = 0; setRabbitActive(true); }
      if (t >= timeline.drainStart && !draining) {
        if (dashboardReady || performance.now() >= readyCapAt) { draining = true; liftAt = t + timeline.liftAfterDrain; }
        else { showJumpProgram(); timeline.drainStart += 100; }
      }
      // Trail wash, then the drops.
      ctx.fillStyle = draining ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(0, 0, W, H);
      const white = performance.now() < whiteUntil, speedMul = draining ? 5 : 1;
      for (const c of columns) {
        for (const d of c.drops) {
          d.y += d.speed * speedMul * dt;
          const row = Math.floor(d.y);
          if (row === d.last) continue;
          d.last = row; d.step++;
          const y = row * fontSize;
          if (y > H + fontSize) { if (!draining) Object.assign(d, newDrop(false)); continue; }
          if (y < -fontSize) continue;
          const behind = c.initials ? INITIALS[(d.step - 1) & 1] : randGlyph();
          drawGlyph(behind, c.x, y - fontSize, white ? '#d9d9d9' : (c.initials ? '#2fdf62' : '#00ff41'), c.mirror && !c.initials);
          const head = c.initials ? INITIALS[d.step & 1] : randGlyph();
          drawGlyph(head, c.x, y, white ? '#ffffff' : '#e8ffe8', c.mirror && !c.initials);
        }
      }
      fxCtx.clearRect(0, 0, W, H);
      if (rabbit) drawRabbit(t);
      if (draining && t >= liftAt && !root.classList.contains('is-lifting')) lift();
      if (draining && t >= liftAt + timeline.doneAfterLift + 400) { running = false; finish(); return; }
      raf = requestAnimationFrame(loop);
    };

    const onCanvasClick = (event) => {
      // A stray click does nothing: skipping belongs to the blue pill. Only the rabbit reacts.
      if (!rabbit?.box) return;
      const r = rain.getBoundingClientRect(), b = rabbit.box;
      const x = event.clientX - r.left, y = event.clientY - r.top;
      if (x >= b.x - 40 && x <= b.x + b.w + 40 && y >= b.y - 40 && y <= b.y + b.h + 40) catchRabbit();
    };
    const onKey = (event) => { if (event.key === 'Escape') skipRef.current(); };
    const skip = () => { if (!running) return; draining = true; lift(); after(900, () => { running = false; finish(); }); };
    skipRef.current = skip;

    resize();
    window.addEventListener('resize', resize);
    rain.addEventListener('click', onCanvasClick);
    window.addEventListener('keydown', onKey);
    after(TIMELINE.decodeStart, () => { decodeInto(titleEl, greeting, TIMELINE.decodeMs); after(150, () => voice.play(VOICE_LINES[greeting])); });
    after(TIMELINE.linesStart, runLines);
    after(900, () => setControlsOn(true));
    raf = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      unsubscribe();
      voice.dispose();
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      rain.removeEventListener('click', onCanvasClick);
    };
  }, [finish, reducedMotion, run]);

  const toggleMute = (event) => {
    event.stopPropagation();
    const next = !muted;
    setMuted(next);
    writeMuted(next);
  };

  return (
    <div ref={rootRef} className="matrix-entry" role="dialog" aria-modal="true" aria-label="Signing in to the admin dashboard">
      <canvas ref={rainRef} className={`matrix-entry__rain ${rabbitActive ? 'is-rabbit' : ''}`} />
      <canvas ref={fxRef} className="matrix-entry__fx" />
      <div ref={textRef} className="matrix-entry__text">
        <div ref={titleRef} className="matrix-entry__title" role="heading" aria-level="1" />
        <div ref={linesRef} className="matrix-entry__lines" />
      </div>
      <div className={`matrix-entry__controls ${controlsOn ? 'is-on' : ''}`}>
        <button
          type="button"
          className={`matrix-entry__pill matrix-entry__pill--speaker ${muted ? 'is-muted' : ''}`}
          aria-pressed={muted}
          aria-label={muted ? 'Voice muted. Click to unmute' : 'Voice on. Click to mute'}
          onClick={toggleMute}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
            <path className="matrix-entry__speaker-wave" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path className="matrix-entry__speaker-cross" d="M3 21L21 3" fill="none" stroke="#ff5566" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className="matrix-entry__pill" aria-label="Play the entry again" onClick={() => setRun((n) => n + 1)}>
          <i className="matrix-entry__capsule matrix-entry__capsule--red" aria-hidden="true" />
          <span>PLAY</span>
        </button>
        <button type="button" className="matrix-entry__pill" aria-label="Skip to the dashboard" onClick={() => skipRef.current()}>
          <i className="matrix-entry__capsule matrix-entry__capsule--blue" aria-hidden="true" />
          <span>SKIP</span>
        </button>
      </div>
    </div>
  );
};

export default MatrixEntry;
