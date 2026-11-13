// src/components/admin/Voyage/VoyagePage.js
//
// The admin as one sky. The document scrolls natively; a fixed canvas behind
// it shows the 3D field, and one animation loop turns the scroll fraction into
// camera travel and constellation drawing. Sixteen chapter stages come from
// the registry. In Unit V1 the deck chapters are placeholders that point at
// the classic managers; mission control, the rail, the palette and the field
// are real. Without WebGL, or with reduced motion, the 2D zodiac sky stands
// behind the same page and the camera cuts instead of flying.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command as CommandIcon, LogOut } from 'lucide-react';
import { getPortfolioStats } from '../../../services/dataService';
import analyticsService from '../../../services/analyticsService';
import { getRecentEdits, getTopPages, getUnreadMessages, getVisitorSeries } from '../../../services/voyageData';
import { startSession } from '../../../services/adminSessionFacts';
import { markDashboardReady } from '../AdminWelcome/adminReadiness';
import SkyBackground, { SKY_ASSET_BASE } from '../SkyBackground/SkyBackground';
import SkyControls from '../SkyBackground/SkyControls';
import { SkySettingsProvider, useSkySettings } from '../SkyBackground/SkySettingsContext';
import { CHAPTERS, chapterIndex, chapterPlace } from './chapters';
import Bento from './Bento';
import CommandPalette from './CommandPalette';
import StarRail from './StarRail';
import { createSkyField, webglAvailable } from './skyField';
import { isChapterLive, liveChapterIndex, qualityFor, routePosition, scrollFractionFor, greetingFor } from './voyageModel';
import './Voyage.css';

/** Names of the constellations, from figures.json, for the rail and the palette. */
const namesFrom = (figures) => Object.fromEntries((figures || []).map((f) => [f.id, f.name]));

function VoyageView({ requireSecurityEnrollment }) {
  const navigate = useNavigate();
  const { resolvedTheme, effectiveMotion } = useSkySettings();
  const [figures, setFigures] = useState(null), [deep, setDeep] = useState([]);
  const [data, setData] = useState({ health: null, visitors: null, inbox: null, edits: null, pages: null, stats: null, assetBase: SKY_ASSET_BASE });
  const [active, setActive] = useState(0), [paletteOpen, setPaletteOpen] = useState(false), [over, setOver] = useState('');
  const [webgl] = useState(() => webglAvailable());
  const canvasRef = useRef(null), fieldRef = useRef(null), stageRefs = useRef([]);
  const names = useMemo(() => namesFrom(figures), [figures]);

  // ---- data: figures and photographs for the field, facts for the tiles ----
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${SKY_ASSET_BASE}figures.json`).then((r) => (r.ok ? r.json() : { figures: [] })).catch(() => ({ figures: [] })),
      fetch(`${SKY_ASSET_BASE}deep/manifest.json`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([f, d]) => { if (!cancelled) { setFigures(Array.isArray(f?.figures) ? f.figures : []); setDeep(Array.isArray(d) ? d : []); } });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    startSession();
    let cancelled = false;
    const settle = (patch) => { if (!cancelled) setData((prev) => ({ ...prev, ...patch })); };
    analyticsService.getPortfolioHealth().then((health) => { settle({ health }); markDashboardReady(); }).catch(() => markDashboardReady());
    getPortfolioStats().then((stats) => settle({ stats })).catch(() => {});
    getVisitorSeries(30).then((visitors) => settle({ visitors })).catch(() => {});
    getUnreadMessages().then((inbox) => settle({ inbox })).catch(() => {});
    getRecentEdits(6).then((edits) => settle({ edits })).catch(() => {});
    getTopPages(30, 5).then((pages) => settle({ pages })).catch(() => {});
    const safety = setTimeout(markDashboardReady, 6000);   // the entry never waits on a slow table
    return () => { cancelled = true; clearTimeout(safety); };
  }, []);

  // The 2025 viewport code puts `transform: scale(1)` on <html> and <body> (viewportUtils.js and
  // globals.css). An identity transform still makes the body the containing block for fixed
  // elements, so the field canvas would stretch to the page's full height and scroll away. While
  // the voyage is mounted the transform is lifted; it is restored on unmount so nothing else changes.
  useEffect(() => {
    const roots = [document.documentElement, document.body];
    const previous = roots.map((el) => [el.style.getPropertyValue('transform'), el.style.getPropertyPriority('transform')]);
    const lift = () => roots.forEach((el) => { if (el.style.getPropertyValue('transform') !== 'none') el.style.setProperty('transform', 'none', 'important'); });
    lift();
    // viewportUtils re-applies its scale(1) on every resize; watch the style attributes and lift again.
    const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(lift) : null;
    roots.forEach((el) => observer?.observe(el, { attributes: true, attributeFilter: ['style'] }));
    return () => {
      observer?.disconnect();
      roots.forEach((el, i) => { if (previous[i][0]) el.style.setProperty('transform', previous[i][0], previous[i][1]); else el.style.removeProperty('transform'); });
    };
  }, []);

  // ---- the field ----
  useEffect(() => {
    if (!webgl || !figures || !canvasRef.current) return undefined;
    const quality = qualityFor({ width: window.innerWidth, devicePixelRatio: window.devicePixelRatio || 1, reducedMotion: !effectiveMotion, webgl: true });
    let field;
    try {
      field = createSkyField({ canvas: canvasRef.current, figures, deepManifest: deep, assetBase: SKY_ASSET_BASE, quality, theme: resolvedTheme, smallTextures: window.innerWidth < 768 });
    } catch { return undefined; }   // a GPU refusal falls through to the 2D sky on the next render
    fieldRef.current = field;
    const resize = () => field.resize(window.innerWidth, window.innerHeight);
    resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); field.dispose(); fieldRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webgl, figures, deep]);
  useEffect(() => { fieldRef.current?.setTheme(resolvedTheme); }, [resolvedTheme, figures]);
  useEffect(() => { fieldRef.current?.setFly(effectiveMotion); }, [effectiveMotion, figures]);

  // ---- the loop: scroll fraction to camera, stages and rail ----
  useEffect(() => {
    let frame = 0, stopped = false, lastIndex = -1, lastOver = '';
    const scrollFraction = () => { const max = document.documentElement.scrollHeight - window.innerHeight; return max > 0 ? window.scrollY / max : 0; };
    const tick = (now) => {
      if (stopped) return;
      const sf = scrollFraction();
      const route = fieldRef.current ? fieldRef.current.frame(sf, now) : routePosition(sf);
      const live = liveChapterIndex(route.f);
      stageRefs.current.forEach((el, i) => el?.classList.toggle('is-live', isChapterLive(i, route.f)));
      if (live !== lastIndex) { lastIndex = live; setActive(live); }
      if (route.over !== undefined && route.over !== lastOver) { lastOver = route.over; setOver(route.over); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onVisibility = () => { if (document.hidden) { cancelAnimationFrame(frame); stopped = true; } else if (stopped) { stopped = false; frame = requestAnimationFrame(tick); } };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stopped = true; cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  const jump = useCallback((i) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: scrollFractionFor(i) * max, behavior: effectiveMotion ? 'smooth' : 'auto' });
  }, [effectiveMotion]);
  const go = useCallback((id) => jump(Math.max(0, chapterIndex(id))), [jump]);
  const signOut = useCallback(() => { window.location.assign('/adminsignout'); }, []);
  const actions = useMemo(() => [
    { id: 'classic', label: 'Open the classic dashboard', hint: 'until the voyage replaces it', run: () => navigate('/admindashboard') },
    { id: 'signout', label: 'Sign out', hint: 'the film plays', run: signOut },
  ], [navigate, signOut]);

  const greeting = useMemo(() => greetingFor(), []);
  const countFor = (chapter) => { const s = data.stats; if (!s || !chapter.table) return null; const key = { hero_content: null, about_content: null, projects: 'projects', internships: 'internships', education: 'education', work_experience: 'workExperience', skills: 'skills', certifications: 'certifications', recommendations: 'recommendations', achievements: 'achievements', leadership: 'leadership', contact_messages: 'messages' }[chapter.table]; return key ? s[key] ?? null : null; };

  return (
    <div className={`voyage${webgl ? ' voyage--webgl' : ' voyage--flat'}`} data-testid="voyage">
      {webgl ? <canvas ref={canvasRef} className="voyage-field" aria-hidden="true" /> : <div className="voyage-flat-sky"><SkyBackground motion={false} /></div>}
      <header className="voyage-bar">
        <span className="voyage-bar__brand">RC · ADMIN</span>
        <span className="voyage-bar__hint">scroll to travel · <kbd>⌘K</kbd> jump anywhere</span>
        <div className="voyage-bar__actions">
          <SkyControls />
          <button type="button" className="voyage-bar__button" onClick={() => setPaletteOpen(true)} aria-label="Open the command palette"><CommandIcon size={16} /><span>Jump</span></button>
          <button type="button" className="voyage-bar__button voyage-bar__button--quiet" onClick={signOut} aria-label="Sign out"><LogOut size={16} /><span>Sign out</span></button>
        </div>
      </header>
      <div className="voyage-progress" style={{ width: `${(active / (CHAPTERS.length - 1)) * 100}%` }} aria-hidden="true" />

      <main className="voyage-page">
        {CHAPTERS.map((chapter, i) => (
          <section key={chapter.id} id={`chapter-${chapter.id}`} ref={(el) => { stageRefs.current[i] = el; }} className="voyage-chapter" aria-labelledby={`chapter-${chapter.id}-title`}>
            <div className="voyage-chapter__head">
              <div>
                <div className="voyage-chapter__kicker">{String(i).padStart(2, '0')} · {chapterPlace(chapter, names)}</div>
                <h2 className="voyage-chapter__title" id={`chapter-${chapter.id}-title`}>{chapter.kind === 'prologue' ? `${greeting}, Raunak` : chapter.name}</h2>
                <p className="voyage-chapter__sub">{chapter.sub}</p>
                {chapter.kind === 'prologue' && over && <p className="voyage-chapter__over" aria-live="off">{over}</p>}
              </div>
            </div>
            {chapter.kind === 'bento' && (requireSecurityEnrollment
              ? <div className="voyage-pane voyage-notice">Confirm an authenticator app in Security before the managers open.</div>
              : <Bento data={data} onGo={go} />)}
            {chapter.kind !== 'bento' && chapter.kind !== 'prologue' && (
              <div className="voyage-pane voyage-placeholder">
                <p>{countFor(chapter) !== null ? <><b>{countFor(chapter)}</b> {countFor(chapter) === 1 ? 'item' : 'items'} in this section.</> : 'This chapter is on its way.'}</p>
                <p className="voyage-placeholder__note">The deck and the editor sheet arrive in the next unit. Until then this section is edited in the classic dashboard.</p>
                <button type="button" className="voyage-bar__button" onClick={() => navigate('/admindashboard')}>Open in the classic dashboard</button>
              </div>
            )}
          </section>
        ))}
      </main>

      <StarRail active={active} onJump={jump} names={names} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onJump={jump} actions={actions} names={names} />
    </div>
  );
}

export default function VoyagePage(props) {
  return (
    <SkySettingsProvider>
      <VoyageView {...props} />
    </SkySettingsProvider>
  );
}
