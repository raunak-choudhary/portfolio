// src/components/admin/AdminSignOut/AdminSignOut.js
//
// The sign-out sequence. The dashboard sends the admin here with a full page
// load; this page ends the Supabase session itself on mount and returns to
// the login when the sequence is over. Seventeen seconds: the clapperboard,
// the countdown leader, the credits, the शुभम् card.
//
// The structure is React; the per-frame work (phase classes, plane positions,
// the two canvases) is done imperatively on refs from one animation loop, so
// nothing re-renders sixty times a second. Scrolling speeds the credits, a
// click skips to the card, Escape goes straight to the login. With reduced
// motion the card alone is shown, briefly.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAssuranceState, signOutAdmin } from '../../../services/authService';
import SkyBackground from '../SkyBackground/SkyBackground';
import { SkySettingsProvider } from '../SkyBackground/SkySettingsContext';
import { createExitAudio } from './exitAudio';
import { drawCreditBackground, drawLeader, makeArcs } from './exitCanvas';
import {
  DIRECTOR, FAREWELLS, REDUCED_TIMELINE, TIMELINE, buildScript, creditFacts, phaseClasses, planeState, sceneLine, takeLine, wheelBoost,
} from './exitModel';
import { clearSession, readSessionFacts } from '../../../services/adminSessionFacts';
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
  const now = useMemo(() => new Date(), []);
  const T = reduced ? REDUCED_TIMELINE : TIMELINE;

  // The script: cast from the farewells, crew from this session's facts (only what was recorded).
  const script = useMemo(() => buildScript({ farewells: FAREWELLS, facts: creditFacts({ facts, now, assurance }), director: DIRECTOR }), [facts, now, assurance]);

  const rootRef = useRef(null), leaderRef = useRef(null), bgRef = useRef(null), planeRefs = useRef([]);
  const audioRef = useRef(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => { loadCondensedFont(); }, []);

  // End the session: read the assurance level first (for the credits), then sign out.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const state = await getAssuranceState(); if (!cancelled) setAssurance(state?.currentLevel || null); } catch { /* the line is simply omitted */ }
      await signOutAdmin();
    })();
    return () => { cancelled = true; };
  }, []);

  // The master clock.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const audio = createExitAudio({ enabled: !muted && !reduced });
    audioRef.current = audio;
    const arcs = makeArcs();
    const creditScale = (T.creditsEnd - T.credits) / script.length;
    let start = performance.now(), boost = 0, jumpTo = null, lastClasses = '', lastNum = null, frame = 0, finished = false;
    let view = { W: window.innerWidth, H: window.innerHeight, dpr: Math.min(window.devicePixelRatio || 1, 2), font: CONDENSED };
    const size = () => {
      view = { ...view, W: window.innerWidth, H: window.innerHeight, dpr: Math.min(window.devicePixelRatio || 1, 2) };
      for (const c of [leaderRef.current, bgRef.current]) if (c) { c.width = Math.floor(view.W * view.dpr); c.height = Math.floor(view.H * view.dpr); }
    };
    size();
    const has = (classes, name) => classes.includes(name);
    const flash = () => { const f = root.querySelector('.exit-flash'); if (!f) return; f.style.transition = 'none'; f.style.opacity = '0.9'; requestAnimationFrame(() => { f.style.transition = 'opacity 160ms ease'; f.style.opacity = '0'; }); };
    const finish = () => {
      if (finished) return;
      finished = true;
      audio.whirOff();
      clearSession();
      try { localStorage.removeItem('admin_analytics_session'); } catch { /* nothing to clear */ }
      navigate('/adminlogin', { replace: true });
    };
    const tick = (nowMs) => {
      if (finished) return;
      let t = nowMs - start + boost;
      if (jumpTo !== null) { boost += jumpTo - t; t = jumpTo; jumpTo = null; }
      const classes = phaseClasses(t, T);
      const key = classes.join(' ');
      if (key !== lastClasses) {
        const wasSnap = lastClasses.includes('snap'), wasLeader = lastClasses.includes('leader');
        root.className = `exit ${key}`;
        if (!wasSnap && has(classes, 'snap')) { audio.clap(); setTimeout(flash, 40); }
        if (!wasLeader && has(classes, 'leader')) audio.whirOn();
        if (wasLeader && !has(classes, 'leader')) audio.whirOff();
        lastClasses = key;
      }
      if (has(classes, 'leader') && leaderRef.current) {
        const ctx = leaderRef.current.getContext('2d');
        if (ctx) { const n = drawLeader(ctx, view, t - T.leader); if (n !== lastNum) { audio.beep(n === 2); lastNum = n; } }
      }
      if (has(classes, 'credits')) {
        const ctx = bgRef.current?.getContext('2d');
        if (ctx) drawCreditBackground(ctx, view, nowMs, arcs);
        const squeeze = view.W < 640 ? 0.35 : 1, ct = t - T.credits;
        script.planes.forEach((plane, i) => {
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
    const onClick = (e) => { if (e.target.closest('.exit-mute')) return; const t = performance.now() - start + boost; if (t < T.card) jumpTo = T.card; };
    const onKey = (e) => { if (e.key === 'Escape') jumpTo = T.login; };
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
    // The loop is built once per script; mute is applied through the audio object below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script, T, navigate, reduced]);

  useEffect(() => { audioRef.current?.setEnabled(!muted && !reduced); }, [muted, reduced]);

  return (
    <div className="exit" ref={rootRef} data-testid="exit-sequence">
      <SkySettingsProvider>
        <div className="exit-sky"><SkyBackground liveSun={false} motion={false} /></div>
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
      <button type="button" className="exit-mute" onClick={() => setMuted((m) => !m)} aria-pressed={muted} title={muted ? 'Sound off' : 'Sound on'}>
        {muted ? '🔇' : '🔊'}
      </button>
      <p className="exit-hint">click · skip to the card &nbsp; scroll · speed the credits &nbsp; esc · login</p>
    </div>
  );
}
