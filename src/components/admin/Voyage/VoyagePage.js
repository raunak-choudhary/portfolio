// src/components/admin/Voyage/VoyagePage.js
//
// The admin as one sky. The document scrolls natively; a fixed canvas behind
// it shows the 3D field, and one animation loop turns the scroll fraction into
// camera travel and constellation drawing. Sixteen chapter stages come from
// the registry. Without WebGL, or with reduced motion, the 2D zodiac sky stands
// behind the same page and the camera cuts instead of flying.
//
// Two sky modes follow the Sky menu's Panels switch (renderBudget.js): with
// the panels on ("working") the field runs at a lower resolution and 30 fps
// and the glass shows a still, pre-blurred snapshot of the sky (a fixed CSS
// background) instead of a live backdrop blur; with the panels off
// ("showcase") the chapter content steps aside and the field runs at full
// resolution and frame rate. Per-frame values reach the rail, the progress
// bar and the Earth readout through signals, never through page state.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Command as CommandIcon, Lock, LogOut } from 'lucide-react';
import { getPortfolioStats } from '../../../services/dataService';
import analyticsService from '../../../services/analyticsService';
import { getRecentEdits, getTopPages, getUnreadMessages, getVisitorSeries } from '../../../services/voyageData';
import { startSession } from '../../../services/adminSessionFacts';
import { recordVoyagePosition } from '../../../services/voyagePosition';
import { markDashboardReady } from '../AdminWelcome/adminReadiness';
import SkyBackground, { SKY_ASSET_BASE } from '../SkyBackground/SkyBackground';
import SkyControls from '../SkyBackground/SkyControls';
import { SkySettingsProvider, useSkySettings } from '../SkyBackground/SkySettingsContext';
import { CHAPTERS, chapterIndex, chapterPlace } from './chapters';
import DeckChapter from './DeckChapter';
import InboxChapter from './InboxChapter';
import AnalyticsChapter from './AnalyticsChapter';
import MediaChapter from './MediaChapter';
import SecurityChapter from './SecurityChapter';
import SingletonChapter from './SingletonChapter';
import Toast, { useToast } from './Toast';
import { schemaForTable } from './managers';
import MissionControl from './MissionControl';
import FixQueuePane, { FIX_QUEUE_ID, useFixQueue } from './FixQueuePane';
import { chapterForTable } from './fixQueueModel';
import { clearIntent, fixesChanged, queueRequests, recordIntent, resetRecordIntent } from './recordIntent';
import CommandPalette from './CommandPalette';
import StarRail from './StarRail';
import { createSkyField, webglAvailable } from './skyField';
import { createSignal, useSignal } from './signal';
import { MODES, SNAPSHOT_SCALE, adaptQuality, initialAdaptState, modeFor, pixelRatioFor, snapshotBlurPx, snapshotDue } from './renderBudget';
import { isChapterLive, liveChapterIndex, qualityFor, routeFromTops, routePosition, greetingFor } from './voyageModel';
import './Voyage.css';

/** Names of the constellations, from figures.json, for the rail and the palette. */
// chapter kinds with their own component; the rest show the placeholder until their unit
const BUILT_KINDS = new Set(['prologue', 'bento', 'inbox', 'charts', 'security']);
// the media library is a deck with no table of its own: storage is its source
const MEDIA_CHAPTER = 'media';
const namesFrom =(figures) => Object.fromEntries((figures || []).map((f) => [f.id, f.name]));

/** Set on <html> while the voyage is mounted, so its scrollbars can be styled apart from the public site's. */
export const VOYAGE_ROOT_CLASS = 'voyage-root';
/** CSS custom property on <html> holding the working mode's glass snapshot (a blob: URL, allowed by the CSP's img-src). */
export const SNAPSHOT_PROPERTY = '--voyage-snapshot';
const TOP_BAR = 56;   // height of the fixed top bar, which a stage's top sits under

/** The rail, lit by the live-chapter signal, so only the rail re-renders when the chapter changes. */
function LiveRail({ signal, ...props }) { return <StarRail active={useSignal(signal)} {...props} />; }
/** The thin progress line under the bar. */
function Progress({ signal }) { return <div className="voyage-progress" style={{ width: `${(useSignal(signal) / (CHAPTERS.length - 1)) * 100}%` }} aria-hidden="true" />; }
/** The city passing under the camera in the prologue, refreshed once a second by the field. */
function OverReadout({ signal }) { const over = useSignal(signal); return over ? <p className="voyage-chapter__over" aria-live="off">{over}</p> : null; }

/** The sentence every locked chapter shows until the first authenticator app is confirmed. */
export const ENROLMENT_LOCK_TEXT = 'Set up an authenticator app in Security to open this chapter.';
/** Chapters that stay open while enrolment is required: the Earth and Security itself. */
const OPEN_WHILE_LOCKED = new Set(['prologue', 'security']);

/** The request a locked chapter shows instead of its content. */
function EnrolmentLock({ onGo }) {
  return (
    <div className="voyage-pane voyage-notice" role="note">
      <p><Lock size={15} aria-hidden="true" /> {ENROLMENT_LOCK_TEXT}</p>
      <button type="button" className="voyage-bar__button voyage-bar__button--primary" onClick={onGo}><span>Go to Security</span></button>
    </div>
  );
}

function VoyageView({ requireSecurityEnrollment }) {
  const { settings, resolvedTheme, effectiveMotion } = useSkySettings();
  const mode = modeFor(settings.panels);
  const modeRef = useRef(mode); modeRef.current = mode;
  const snapshotStale = useRef(true);   // retake the glass snapshot at the next rest (theme, blur, size or mode changed)
  const [figures, setFigures] = useState(null), [deep, setDeep] = useState([]);
  const [data, setData] = useState({ health: null, visitors: null, inbox: null, edits: null, pages: null, stats: null, assetBase: SKY_ASSET_BASE });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeSignal] = useState(() => createSignal(0)), [overSignal] = useState(() => createSignal(''));
  const { toast, notify } = useToast();
  const [webgl] = useState(() => webglAvailable());
  const canvasRef = useRef(null), fieldRef = useRef(null), stageRefs = useRef([]);
  const routeRef = useRef(0);   // the camera's route coordinate, kept for the sign-out film's backdrop
  const names = useMemo(() => namesFrom(figures), [figures]);
  const fixes = useFixQueue();
  const bentoData = useMemo(() => ({ ...data, fixes }), [data, fixes]);
  const queueAsked = useSignal(queueRequests), contentChanged = useSignal(fixesChanged), intent = useSignal(recordIntent);

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

  // globals.css paints every scrollbar with the public site's cyan-to-purple
  // gradient, and an unscoped ::-webkit-scrollbar also reaches the document
  // and the phone star rail. A class on <html> while the voyage is mounted
  // lets Voyage.css give them the voyage's own quiet bars; the public site,
  // which never has the class, keeps its gradient.
  useEffect(() => {
    document.documentElement.classList.add(VOYAGE_ROOT_CLASS);
    return () => document.documentElement.classList.remove(VOYAGE_ROOT_CLASS);
  }, []);

  // ---- the field ----
  useEffect(() => {
    if (!webgl || !figures || !canvasRef.current) return undefined;
    const quality = qualityFor({ width: window.innerWidth, devicePixelRatio: window.devicePixelRatio || 1, reducedMotion: !effectiveMotion, webgl: true, sky: modeRef.current });
    let field;
    try {
      field = createSkyField({ canvas: canvasRef.current, figures, deepManifest: deep, assetBase: SKY_ASSET_BASE, quality, theme: resolvedTheme, smallTextures: window.innerWidth < 768 });
    } catch { return undefined; }   // a GPU refusal falls through to the 2D sky on the next render
    fieldRef.current = field;
    const resize = () => { field.resize(window.innerWidth, window.innerHeight); snapshotStale.current = true; };
    resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); field.dispose(); fieldRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webgl, figures, deep]);
  useEffect(() => { fieldRef.current?.setTheme(resolvedTheme); snapshotStale.current = true; }, [resolvedTheme, figures]);
  useEffect(() => { snapshotStale.current = true; }, [settings.blur, mode]);
  // The mode on the page (for the panel fade) and on <html> (for the record dialog, portalled outside the page).
  useEffect(() => {
    document.documentElement.dataset.voyageMode = mode;
    return () => { delete document.documentElement.dataset.voyageMode; };
  }, [mode]);
  useEffect(() => { fieldRef.current?.setFly(effectiveMotion); }, [effectiveMotion, figures]);

  // ---- the loop: scroll fraction to camera, stages and rail ----
  useEffect(() => {
    let frame = 0, stopped = false, lastFrameAt = null;
    const liveState = [];
    // The route follows the stage under the viewport (stages differ in height: a deck is several screens).
    // Reading offsetTop every frame forced a layout per frame (107 ms in the 4x trace), so the tops are
    // measured once and again only when a stage or the window changes size.
    let tops = null;
    const measure = () => { tops = stageRefs.current.map((el) => (el ? el.offsetTop - TOP_BAR : 0)); };
    const invalidate = () => { tops = null; };
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(invalidate) : null;
    stageRefs.current.forEach((el) => el && resizeObserver?.observe(el));
    window.addEventListener('resize', invalidate);
    const scrollFraction = () => { if (!tops) measure(); return routeFromTops(window.scrollY, tops, window.innerHeight - TOP_BAR) / Math.max(1, CHAPTERS.length - 1); };

    // Adaptive resolution: a long run of slow frames lowers the pixel ratio a step, a longer run of fast ones raises it.
    let adapt = initialAdaptState(), adaptMode = modeRef.current;
    const ratioFor = (level) => pixelRatioFor({ mode: modeRef.current, devicePixelRatio: window.devicePixelRatio || 1, phone: window.innerWidth < 768, level });
    // The working mode's glass: a small blurred still of the sky, taken when the camera rests.
    let stillSince = null, snapshotF = null, snapshotUrl = null, taking = false;
    const takeSnapshot = (field, f) => {
      taking = true;
      snapshotStale.current = false;
      const blur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sky-blur')) || 5;
      field.snapshot({ scale: SNAPSHOT_SCALE, blurPx: snapshotBlurPx(blur) }).then((blob) => {
        taking = false;
        if (stopped || !blob) return;
        const url = URL.createObjectURL(blob);
        document.documentElement.style.setProperty(SNAPSHOT_PROPERTY, `url("${url}")`);
        if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
        snapshotUrl = url; snapshotF = f;
      }, () => { taking = false; });
    };

    const tick = (now) => {
      if (stopped) return;
      const field = fieldRef.current;
      const sf = scrollFraction();
      const route = field ? field.frame(sf, now) : routePosition(sf);
      routeRef.current = route.f;
      for (let i = 0; i < CHAPTERS.length; i++) {
        const isLive = isChapterLive(i, route.f);
        if (liveState[i] !== isLive) { liveState[i] = isLive; stageRefs.current[i]?.classList.toggle('is-live', isLive); }
      }
      activeSignal.set(liveChapterIndex(route.f));
      if (route.over !== undefined) overSignal.set(route.over);
      if (field) {
        if (adaptMode !== modeRef.current) {   // a mode switch starts again from the mode's own full quality
          adaptMode = modeRef.current; adapt = initialAdaptState();
          field.setQuality({ pixelRatio: ratioFor(0), frameInterval: MODES[adaptMode].frameInterval });
        } else if (lastFrameAt !== null) {
          adapt = adaptQuality(adapt, now - lastFrameAt);
          if (adapt.changed) field.setQuality({ pixelRatio: ratioFor(adapt.level) });
        }
        stillSince = route.settled ? (stillSince ?? now) : null;
        if (modeRef.current === 'working' && !taking && snapshotDue({ hasSnapshot: snapshotUrl !== null, stillForMs: stillSince === null ? 0 : now - stillSince, f: route.f, snapshotF, stale: snapshotStale.current })) takeSnapshot(field, route.f);
      }
      lastFrameAt = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onVisibility = () => { if (document.hidden) { cancelAnimationFrame(frame); stopped = true; } else if (stopped) { stopped = false; lastFrameAt = null; frame = requestAnimationFrame(tick); } };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true; cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', invalidate);
      resizeObserver?.disconnect();
      document.documentElement.style.removeProperty(SNAPSHOT_PROPERTY);
      if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
    };
  }, [activeSignal, overSignal]);

  const jump = useCallback((i) => {
    const el = stageRefs.current[i];
    const top = el ? Math.max(0, el.offsetTop - 56) : 0;
    window.scrollTo({ top, behavior: effectiveMotion ? 'smooth' : 'auto' });
  }, [effectiveMotion]);
  const go = useCallback((id) => jump(Math.max(0, chapterIndex(id))), [jump]);

  // ---- the fix queue and record intents ----
  // A new intent travels to its table's chapter (the chapter then opens the record);
  // the steps of one walk stay in that chapter, so only a change of table moves the page.
  // A chapter held behind the authenticator lock never mounts, so an intent for
  // it would wait there and fire later; it is dropped with a word instead.
  const intentTable = useRef(null);
  useEffect(() => {
    const table = intent?.table || null;
    if (table && table !== intentTable.current) {
      const id = chapterForTable(table);
      if (id && requireSecurityEnrollment) { clearIntent(); notify('Set up an authenticator app first; the chapters open once it is confirmed.', 'bad'); go('security'); }
      else if (id) go(id);
    }
    intentTable.current = intent ? table : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, go, requireSecurityEnrollment]);
  // intents and queue requests belong to one visit
  useEffect(() => () => resetRecordIntent(), []);
  useEffect(() => {
    if (!queueAsked) return;
    document.getElementById(FIX_QUEUE_ID)?.scrollIntoView({ behavior: effectiveMotion ? 'smooth' : 'auto', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueAsked]);
  // a walk ended: the health tile reloads with the queue
  useEffect(() => {
    if (!contentChanged) return undefined;
    let alive = true;
    analyticsService.getPortfolioHealth().then((health) => { if (alive) setData((prev) => ({ ...prev, health })); }).catch(() => {});
    return () => { alive = false; };
  }, [contentChanged]);
  // The film on /adminsignout plays over this same sky, frozen where the camera is now.
  const signOut = useCallback(() => {
    recordVoyagePosition({ f: routeRef.current, theme: resolvedTheme });
    window.location.assign('/adminsignout');
  }, [resolvedTheme]);
  const actions = useMemo(() => [
    { id: 'signout', label: 'Sign out', hint: 'the film plays', run: signOut },
  ], [signOut]);

  const greeting = useMemo(() => greetingFor(), []);
  // First-time enrolment: every chapter but the Earth and Security shows only the request.
  const locked = (chapter) => Boolean(requireSecurityEnrollment) && !OPEN_WHILE_LOCKED.has(chapter.kind);
  const countFor = (chapter) => { const s = data.stats; if (!s || !chapter.table) return null; const key = { hero_content: null, about_content: null, projects: 'projects', internships: 'internships', education: 'education', work_experience: 'workExperience', skills: 'skills', certifications: 'certifications', recommendations: 'recommendations', achievements: 'achievements', leadership: 'leadership', contact_messages: 'messages' }[chapter.table]; return key ? s[key] ?? null : null; };

  return (
    <div className={`voyage${webgl ? ' voyage--webgl' : ' voyage--flat'}`} data-testid="voyage" data-mode={mode}>
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
      <Progress signal={activeSignal} />

      <main className="voyage-page">
        {CHAPTERS.map((chapter, i) => (
          <section key={chapter.id} id={`chapter-${chapter.id}`} ref={(el) => { stageRefs.current[i] = el; }} className="voyage-chapter" aria-labelledby={`chapter-${chapter.id}-title`}>
            <div className="voyage-chapter__head">
              <div>
                <div className="voyage-chapter__kicker">{String(i).padStart(2, '0')} · {chapterPlace(chapter, names)}</div>
                <h2 className="voyage-chapter__title" id={`chapter-${chapter.id}-title`}>{chapter.kind === 'prologue' ? `${greeting}, Raunak` : chapter.name}</h2>
                <p className="voyage-chapter__sub">{chapter.sub}</p>
                {chapter.kind === 'prologue' && <OverReadout signal={overSignal} />}
              </div>
            </div>
            {locked(chapter) ? <EnrolmentLock onGo={() => go('security')} /> : <>
              {chapter.kind === 'bento' && <MissionControl data={bentoData} onGo={go} motion={effectiveMotion} fixQueue={<FixQueuePane fixes={fixes} onReview={go} notify={notify} />} />}
              {chapter.kind === 'deck' && schemaForTable(chapter.table) && (schemaForTable(chapter.table).mode === 'singleton'
                ? <SingletonChapter schema={schemaForTable(chapter.table)} notify={notify} />
                : <DeckChapter schema={schemaForTable(chapter.table)} notify={notify} />)}
              {chapter.kind === 'inbox' && <InboxChapter notify={notify} />}
              {chapter.kind === 'charts' && <AnalyticsChapter notify={notify} motion={effectiveMotion} />}
              {chapter.id === MEDIA_CHAPTER && <MediaChapter notify={notify} />}
              {chapter.kind === 'security' && <SecurityChapter notify={notify} onLeave={signOut} />}
              {!BUILT_KINDS.has(chapter.kind) && chapter.id !== MEDIA_CHAPTER && !(chapter.kind === 'deck' && schemaForTable(chapter.table)) && (
                <div className="voyage-pane voyage-placeholder">
                  <p>{countFor(chapter) !== null ? <><b>{countFor(chapter)}</b> {countFor(chapter) === 1 ? 'item' : 'items'} in this section.</> : 'This chapter is on its way.'}</p>
                </div>
              )}
            </>}
          </section>
        ))}
      </main>

      <LiveRail signal={activeSignal} onJump={jump} names={names} />
      <Toast toast={toast} />
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
