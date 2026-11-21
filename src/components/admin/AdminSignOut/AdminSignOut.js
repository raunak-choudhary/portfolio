// src/components/admin/AdminSignOut/AdminSignOut.js
//
// The sign-out sequence. The dashboard sends the admin here with a full page
// load; this page ends the Supabase session itself on mount and returns to
// the login when the sequence is over. Seventeen seconds: the clapperboard,
// the countdown leader, the credits, the शुभम् card. It plays over the
// voyage's sky, held where the camera was when the admin signed out
// (ExitVoyageSky); the dim and black layers sit on top of it.
//
// The structure is React; the per-frame work (phase classes, plane positions,
// the two canvases) is done imperatively on refs from one animation loop, so
// nothing re-renders sixty times a second. Scrolling speeds the credits, a
// click skips to the card, Escape goes straight to the login. With reduced
// motion the card alone is shown, briefly.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Volume2, VolumeX } from 'lucide-react';
import { forgetLocalSession, hasSecondFactorSession, signOutAdmin } from '../../../services/authService';
import { SkySettingsProvider } from '../SkyBackground/SkySettingsContext';
import { createExitAudio } from './exitAudio';
import { skyCovered } from './exitBackdrop';
import ExitVoyageSky from './ExitVoyageSky';
import { drawCreditBackground, drawLeader, makeArcs } from './exitCanvas';
import {
  DIRECTOR, FAREWELLS, REDUCED_TIMELINE, TIMELINE, buildScript, createFilmClock, creditFacts, phaseClasses, planeState, sceneLine, takeLine, wheelBoost,
} from './exitModel';
import { clearSession, readSessionFacts } from '../../../services/adminSessionFacts';
import { clearVoyagePosition, readVoyagePosition } from '../../../services/voyagePosition';
import './AdminSignOut.css';

const CONDENSED = "'Oswald', 'Avenir Next Condensed', 'Arial Narrow', Impact, sans-serif";

/** Self-hosted Oswald (SIL Open Font License) for the credits; see public/admin/fonts/README.md. */
const CONDENSED_FONT_URL = `${process.env.PUBLIC_URL || ''}/admin/fonts/oswald-variable.woff2`;
let fontRequested = false;

/** Registers the condensed face once; if the browser lacks the API or the file, the fallback stack is used. */
function loadCondensedFont() {
  if (fontRequested || typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined') return;
  fontRequested = true;
  try {
    const face = new FontFace('Oswald', `url(${CONDENSED_FONT_URL}) format('woff2')`, { weight: '200 700', display: 'swap' });
    face.load().then((loaded) => document.fonts.add(loaded)).catch(() => {});
  } catch { /* fallback fonts */ }
}

/** How long the way to the login waits for a sign-out still in flight before ending the session locally. */
export const SIGN_OUT_WAIT_MS = 3000;

/**
 * Whether this page was reached by the sign-out click itself (a fresh
 * navigation carrying the session's facts), as opposed to a reload or a
 * direct visit. Chrome lets sound start after a same-site navigation that
 * began with a click; on a reload it refuses and logs a warning, so there
 * the sound waits for the first click or key on this page.
 */
const arrivedFromSignOutClick = (hasRecord) => {
  try {
    if (navigator.userActivation?.hasBeenActive) return true;
    const entry = performance.getEntriesByType?.('navigation')?.[0];
    return hasRecord && (!entry || entry.type === 'navigate');
  } catch { return hasRecord; }
};

/** Whether the visitor asked the operating system for less motion. */
const prefersReducedMotion = () => { try { return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** One credit plane; content depends on its kind. */
function Plane({ plane, innerRef }) {
  const { kind, content } = plane;
  let body = null;
  if (kind === 'cast') body = <><span className="exit-cast__lang">{content.language}</span><span className="exit-cast__say" dir={content.rtl ? 'rtl' : 'ltr'}>{content.text}</span></>;
  else if (kind === 'crew') body = <><span className="exit-crew__role">{content.role}</span><span className="exit-crew__val">{content.value}</span></>;
  else if (kind === 'title') body = content.split('\n').map((line, i) => <React.Fragment key={i}>{i > 0 && <br />}{line}</React.Fragment>);
  else body = content;
  return <div ref={innerRef} className={`exit-plane exit-plane--${kind}`} style={{ opacity: 0 }}>{body}</div>;
}

export default function AdminSignOut() {
  const navigate = useNavigate();
  const [reduced] = useState(prefersReducedMotion);
  const [assurance, setAssurance] = useState(null);
  const facts = useMemo(() => readSessionFacts(), []);
  const [skyPosition] = useState(readVoyagePosition);
  const now = useMemo(() => new Date(), []);
  const T = reduced ? REDUCED_TIMELINE : TIMELINE;

  // The script: cast from the farewells, crew from this session's facts (only what was recorded).
  const script = useMemo(() => buildScript({ farewells: FAREWELLS, facts: creditFacts({ facts, now, assurance }), director: DIRECTOR }), [facts, now, assurance]);

  // The film loop reads the script through a ref. The script changes once,
  // when the assurance level arrives; as an effect dependency that change
  // rebuilt the loop and restarted its clock, so the clapperboard rose twice.
  const scriptRef = useRef(script);
  scriptRef.current = script;

  const rootRef = useRef(null), leaderRef = useRef(null), bgRef = useRef(null), planeRefs = useRef([]);
  const audioRef = useRef(null), releaseSkyRef = useRef(null), phaseRef = useRef('');
  const [muted, setMuted] = useState(false);
  // The sign-out in flight: { promise, settled }. One per mount, so React's
  // development double-run of effects does not sign out twice.
  const signOutRef = useRef(null), aliveRef = useRef(true);

  useEffect(() => { loadCondensedFont(); }, []);

  // End the session. The sign-out request starts at once and is not held up
  // by the level read for the credits, which runs beside it: that read uses
  // the stored token and normally needs no request, but auth-js refreshes a
  // token close to expiry first, which is one. The way to the login waits for
  // the sign-out, with a cap (see finish below).
  useEffect(() => {
    aliveRef.current = true;
    if (!signOutRef.current) {
      const state = { settled: false, promise: null };
      state.promise = (async () => {
        try { const verified = await hasSecondFactorSession(); if (aliveRef.current) setAssurance(verified ? 'aal2' : null); } catch { /* the line is simply omitted */ }
        // signOutAdmin retries and, if the server cannot be reached, forgets the session on this device
        try { await signOutAdmin(); } catch { /* handled on the way to the login */ }
        state.settled = true;
      })();
      signOutRef.current = state;
    }
    return () => { aliveRef.current = false; };
  }, []);

  // The master clock.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const audio = createExitAudio({ enabled: !muted && !reduced, eager: arrivedFromSignOutClick(Boolean(facts || skyPosition)) });
    audioRef.current = audio;
    const arcs = makeArcs();
    const clock = createFilmClock();
    let filmTime = 0, boost = 0, jumpTo = null, lastClasses = '', lastNum = null, frame = 0, finished = false;
    let view = { W: window.innerWidth, H: window.innerHeight, dpr: Math.min(window.devicePixelRatio || 1, 2), font: CONDENSED };
    const size = () => {
      view = { ...view, W: window.innerWidth, H: window.innerHeight, dpr: Math.min(window.devicePixelRatio || 1, 2) };
      for (const c of [leaderRef.current, bgRef.current]) if (c) { c.width = Math.floor(view.W * view.dpr); c.height = Math.floor(view.H * view.dpr); }
    };
    size();
    const has = (classes, name) => classes.includes(name);
    const flash = () => { const f = root.querySelector('.exit-flash'); if (!f) return; f.style.transition = 'none'; f.style.opacity = '0.9'; requestAnimationFrame(() => { f.style.transition = 'opacity 160ms ease'; f.style.opacity = '0'; }); };
    const leave = () => {
      releaseSkyRef.current?.();   // give the WebGL context back before the login mounts
      clearSession();
      clearVoyagePosition();
      try { localStorage.removeItem('admin_analytics_session'); } catch { /* nothing to clear */ }
      navigate('/adminlogin', { replace: true });
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      audio.whirOff();
      // The login page sends a signed-in visitor straight back to the
      // dashboard, so it must not mount while the session is still stored.
      // Usually the sign-out finished long ago; after an early Escape or on
      // a slow network, wait for it briefly, then end the session on this
      // device regardless.
      const signOut = signOutRef.current;
      if (!signOut || signOut.settled) { leave(); return; }
      let timer = null;
      const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), SIGN_OUT_WAIT_MS); });
      Promise.race([signOut.promise, timeout])
        .then((outcome) => { clearTimeout(timer); return outcome === 'timeout' ? forgetLocalSession() : null; })
        .catch(() => {})
        .then(() => { if (aliveRef.current) leave(); });
    };
    const tick = (nowMs) => {
      if (finished) return;
      let t = clock(nowMs) + boost;
      if (jumpTo !== null) { boost += jumpTo - t; t = jumpTo; jumpTo = null; }
      filmTime = t;
      const classes = phaseClasses(t, T);
      const key = classes.join(' ');
      if (key !== lastClasses) {
        const wasSnap = lastClasses.includes('snap'), wasLeader = lastClasses.includes('leader');
        root.className = `exit ${key}`;
        // the board claps only while it is on screen: a skip to the card or the login passes 'snap' without it
        if (!wasSnap && has(classes, 'snap') && t < T.black) { audio.clap(); setTimeout(flash, 40); }
        if (!wasLeader && has(classes, 'leader')) audio.whirOn();
        if (wasLeader && !has(classes, 'leader')) audio.whirOff();
        lastClasses = key;
        phaseRef.current = key;
      }
      if (has(classes, 'leader') && leaderRef.current) {
        const ctx = leaderRef.current.getContext('2d');
        if (ctx) { const n = drawLeader(ctx, view, t - T.leader); if (n !== lastNum) { audio.beep(n === 2); lastNum = n; } }
      }
      if (has(classes, 'credits')) {
        const ctx = bgRef.current?.getContext('2d');
        if (ctx) drawCreditBackground(ctx, view, nowMs, arcs);
        const squeeze = view.W < 640 ? 0.35 : 1, ct = t - T.credits;
        const current = scriptRef.current, creditScale = (T.creditsEnd - T.credits) / current.length;
        current.planes.forEach((plane, i) => {
          const el = planeRefs.current[i]; if (!el) return;
          const state = planeState(plane, ct, creditScale, squeeze);
          if (!state) { el.style.opacity = '0'; return; }
          el.style.opacity = String(state.opacity);
          el.style.transform = `translate(-50%, -50%) translate3d(${state.x}vw, ${state.y}vh, ${state.depth}px) rotateY(${state.rotate}deg)`;
        });
      }
      if (t >= T.login) { finish(); return; }
      frame = requestAnimationFrame(tick);
    };
    const onWheel = (e) => { if (lastClasses.includes('credits')) boost += wheelBoost(e.deltaY); };
    let touchY = null;
    const onTouchStart = (e) => { touchY = e.touches[0]?.clientY ?? null; };
    const onTouchMove = (e) => { if (touchY === null || !lastClasses.includes('credits')) return; const y = e.touches[0].clientY; boost += (touchY - y) * 8; touchY = y; };
    // Any click or key on this page is a gesture the browser accepts for sound (a reload has none until then).
    const onClick = (e) => { audio.unlock(); if (e.target.closest('.exit-mute')) return; if (filmTime < T.card) jumpTo = T.card; };
    const onKey = (e) => { audio.unlock(); if (e.key === 'Escape') jumpTo = T.login; };
    window.addEventListener('resize', size);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKey);
    root.addEventListener('click', onClick);
    frame = requestAnimationFrame(tick);
    return () => {
      finished = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', size); window.removeEventListener('wheel', onWheel); window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove); window.removeEventListener('keydown', onKey); root.removeEventListener('click', onClick);
      audio.dispose(); audioRef.current = null;
    };
    // The loop is built once; the script is read through its ref and mute is applied through the audio object below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [T, navigate, reduced]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.setEnabled(!muted && !reduced);
    // sound switched back on during the countdown: the projector whir comes back with it
    if (!muted && !reduced && phaseRef.current.includes('leader')) audio.whirOn();
  }, [muted, reduced]);

  return (
    <div className="exit" ref={rootRef} data-testid="exit-sequence">
      <SkySettingsProvider>
        <div className="exit-sky"><ExitVoyageSky position={skyPosition} releaseRef={releaseSkyRef} shouldPaint={() => !skyCovered(rootRef.current?.className)} /></div>
      </SkySettingsProvider>
      <div className="exit-dim" />
      <div className="exit-black" />

      <div className="exit-clap" aria-hidden="true">
        <div className="exit-clap__stick exit-clap__stick--lower" />
        <div className="exit-clap__stick exit-clap__stick--upper" />
        <div className="exit-clap__hinge" />
        <div className="exit-clap__board">
          <div className="exit-clap__slate">
            <div className="exit-clap__line"><b>PROD</b><span>RC PORTFOLIO</span></div>
            <div className="exit-clap__line"><b>SCENE</b><span>{sceneLine(now)}</span></div>
            <div className="exit-clap__line"><b>TAKE</b><span>{takeLine(facts?.saves ?? 0)}</span></div>
            <div className="exit-clap__line"><b>DIR</b><span>{DIRECTOR.toUpperCase()}</span></div>
          </div>
        </div>
      </div>

      <canvas ref={leaderRef} className="exit-canvas exit-canvas--leader" aria-hidden="true" />
      <canvas ref={bgRef} className="exit-canvas exit-canvas--credits" aria-hidden="true" />
      <div className="exit-credits" aria-hidden="true">
        {script.planes.map((plane, i) => <Plane key={`${plane.kind}-${i}`} plane={plane} innerRef={(el) => { planeRefs.current[i] = el; }} />)}
      </div>

      <div className="exit-card" role="status" aria-live="polite">
        <div className="exit-card__shubham" lang="sa">शुभम्</div>
        <div className="exit-card__end">The End</div>
        <div className="exit-card__note">Signing out · see you at the login</div>
      </div>

      <div className="exit-flash" aria-hidden="true" />
      {/* with reduced motion there is no sound to switch, so no switch */}
      {!reduced && (
        <button type="button" className="exit-mute" onClick={() => setMuted((m) => !m)} aria-pressed={muted} title={muted ? 'Sound off' : 'Sound on'}>
          {muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
        </button>
      )}
      <p className="exit-hint">click · skip to the card &nbsp; scroll · speed the credits &nbsp; esc · login</p>
    </div>
  );
}
