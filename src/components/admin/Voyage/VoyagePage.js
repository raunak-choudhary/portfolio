// src/components/admin/Voyage/VoyagePage.js
//
// The admin as one sky. The document scrolls natively; a fixed canvas behind
// it shows the 3D field, and one animation loop turns the scroll fraction into
// camera travel and constellation drawing. Sixteen chapter stages come from
// the registry. Files are not a chapter: the Files button in the top bar and
// Cmd+K open them in a pop-up over whatever chapter is on screen
// (MediaLibraryDialog). Without WebGL, or with reduced motion, the 2D zodiac sky stands
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
import { Command as CommandIcon, Images, Lock, LogOut } from 'lucide-react';
import { getPortfolioStats } from '../../../services/dataService';
import analyticsService from '../../../services/analyticsService';
import { getRecentEdits, getTopPages, getUnreadMessages, getVisitorSeries } from '../../../services/voyageData';
import { startSession } from '../../../services/adminSessionFacts';
import { recordVoyagePosition } from '../../../services/voyagePosition';
import { markDashboardReady } from '../AdminWelcome/adminReadiness';
import SkyBackground, { SKY_ASSET_BASE } from '../SkyBackground/SkyBackground';
import SkyControls from '../SkyBackground/SkyControls';
import { watchPixelRatio } from '../SkyBackground/watchPixelRatio';
import { SkySettingsProvider, useSkySettings } from '../SkyBackground/SkySettingsContext';
import { CHAPTERS, chapterIndex, chapterPlace } from './chapters';
import DeckChapter from './DeckChapter';
import InboxChapter from './InboxChapter';
import AnalyticsChapter from './AnalyticsChapter';
import MediaLibraryDialog from './MediaLibraryDialog';
import SecurityChapter from './SecurityChapter';
import SingletonChapter from './SingletonChapter';
import ViewOnSiteLink from './ViewOnSiteLink';
import Toast, { useToast } from './Toast';
import { schemaForTable } from './managers';
import MissionControl from './MissionControl';
import FixQueuePane, { FIX_QUEUE_ID, useFixQueue } from './FixQueuePane';
import { chapterForTable } from './fixQueueModel';
import { clearIntent, fixesChanged, openRecord, queueRequests, recordIntent, resetRecordIntent } from './recordIntent';
import CommandPalette from './CommandPalette';
import StarRail from './StarRail';
import { createSkyField, webglAvailable } from './skyField';
import { createSignal, useSignal } from './signal';
import { MODES, SNAPSHOT_SCALE, SNAPSHOT_SETTLE_MS, adaptQuality, initialAdaptState, modeFor, pixelRatioFor, snapshotBlurPx, snapshotDue } from './renderBudget';
import { isChapterLive, liveChapterIndex, qualityFor, routeFromTops, routePosition, greetingFor } from './voyageModel';
import './Voyage.css';

/** First wait before a failed glass snapshot is tried again; each further failure doubles it. */
const SNAPSHOT_RETRY_MS = 2000;

/**
 * Gives back whatever WebGL context a canvas holds. Used when the 3D field
 * could not be built: the renderer may already have taken a context before it
 * threw, and browsers allow only a handful per page. Asking the canvas for a
 * context returns the one it already has; every step is allowed to fail.
 */
export function releaseContext(canvas) {
  for (const kind of ['webgl2', 'webgl']) {
    try {
      const gl = canvas?.getContext?.(kind);
      const lose = gl?.getExtension?.('WEBGL_lose_context');
      if (lose) { lose.loseContext(); return true; }
    } catch { /* nothing to give back */ }
  }
  return false;
}

/** Names of the constellations, from figures.json, for the rail and the palette. */
// chapter kinds with their own component; the rest show the placeholder until their unit
const BUILT_KINDS = new Set(['prologue', 'bento', 'inbox', 'charts', 'security']);
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
  // The probe can pass and the real renderer still be refused (a GPU reset, a shader the driver
  // rejects). The page then stands on the 2D sky, exactly as it does without WebGL.
  const [fieldFailed, setFieldFailed] = useState(false);
  const use3d = webgl && !fieldFailed;
  const pictureChangedAt = useRef(null);   // when a texture last landed or the GPU context came back; the glass snapshot is retaken once it settles
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
    if (!use3d || !figures || !canvasRef.current) return undefined;
    const quality = qualityFor({ width: window.innerWidth, devicePixelRatio: window.devicePixelRatio || 1, reducedMotion: !effectiveMotion, webgl: true, sky: modeRef.current });
    let field;
    try {
      field = createSkyField({
        canvas: canvasRef.current, figures, deepManifest: deep, assetBase: SKY_ASSET_BASE, quality, theme: resolvedTheme, smallTextures: window.innerWidth < 768,
        onPictureChange: () => { pictureChangedAt.current = performance.now(); },
      });
    } catch {
      // A GPU refusal: the next render shows the 2D sky. The renderer may have taken a WebGL context
      // before it threw; it is given back, or it would count against the browser's limit until collected.
      releaseContext(canvasRef.current);
      setFieldFailed(true);
      return undefined;
    }
    fieldRef.current = field;
    const resize = () => { field.resize(window.innerWidth, window.innerHeight); snapshotStale.current = true; };
    resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); field.dispose(); fieldRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [use3d, figures, deep]);
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
    // Dragging the window to a screen with another pixel density fires no resize; the canvas resolution follows it here.
    const unwatchRatio = watchPixelRatio(() => { fieldRef.current?.setQuality({ pixelRatio: ratioFor(adapt.level), level: adapt.level }); snapshotStale.current = true; });
    const scrollFraction = () => { if (!tops) measure(); return routeFromTops(window.scrollY, tops, window.innerHeight - TOP_BAR) / Math.max(1, CHAPTERS.length - 1); };

    // Adaptive resolution: a long run of slow frames lowers the pixel ratio a step, a longer run of fast ones raises it.
    let adapt = initialAdaptState(), adaptMode = modeRef.current;
    const ratioFor = (level) => pixelRatioFor({ mode: modeRef.current, devicePixelRatio: window.devicePixelRatio || 1, phone: window.innerWidth < 768, level });
    // The working mode's glass: a small blurred still of the sky, taken when the camera rests.
    let stillSince = null, snapshotF = null, snapshotUrl = null, taking = false;
    // A still that fails is owed again, but not on the very next frame: an encoder that keeps
    // refusing would cost a full extra render per frame. Each failure doubles the wait, up to 30 s.
    let retryAt = 0, retryWait = SNAPSHOT_RETRY_MS;
    const snapshotFailed = () => { taking = false; snapshotStale.current = true; retryAt = performance.now() + retryWait; retryWait = Math.min(retryWait * 2, 30000); };
    const takeSnapshot = (field, f) => {
      taking = true;
      snapshotStale.current = false;
      const blur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sky-blur')) || 5;
      field.snapshot({ scale: SNAPSHOT_SCALE, blurPx: snapshotBlurPx(blur) }).then((blob) => {
        // A still that could not be used (the tab went hidden, the encoder refused) is owed again, after a wait.
        if (stopped || !blob) { snapshotFailed(); return; }
        taking = false; retryWait = SNAPSHOT_RETRY_MS;
        const url = URL.createObjectURL(blob);
        document.documentElement.style.setProperty(SNAPSHOT_PROPERTY, `url("${url}")`);
        if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
        snapshotUrl = url; snapshotF = f;
      }, snapshotFailed);
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
          field.setQuality({ pixelRatio: ratioFor(0), frameInterval: MODES[adaptMode].frameInterval, mode: adaptMode, level: 0 });
        } else if (lastFrameAt !== null) {
          adapt = adaptQuality(adapt, now - lastFrameAt);
          if (adapt.changed) field.setQuality({ pixelRatio: ratioFor(adapt.level), level: adapt.level });   // the day Sun's surface buffer steps down with the canvas
        }
        stillSince = route.settled ? (stillSince ?? now) : null;
        // Textures arrive in a burst after the first stills; one retake once the burst is over, not one per texture.
        if (pictureChangedAt.current !== null && performance.now() - pictureChangedAt.current > SNAPSHOT_SETTLE_MS) { pictureChangedAt.current = null; snapshotStale.current = true; }
        if (modeRef.current === 'working' && !taking && now >= retryAt && snapshotDue({ hasSnapshot: snapshotUrl !== null, stillForMs: stillSince === null ? 0 : now - stillSince, f: route.f, snapshotF, stale: snapshotStale.current })) takeSnapshot(field, route.f);
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
      unwatchRatio();
      resizeObserver?.disconnect();
      document.documentElement.style.removeProperty(SNAPSHOT_PROPERTY);
      if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
    };
  }, [activeSignal, overSignal]);

  const jump = useCallback((i) => {
    const el = stageRefs.current[i];
    const top = el ? Math.max(0, el.offsetTop - 56) : 0;
    // 'instant', not 'auto': auto defers to the public stylesheet's `scroll-behavior: smooth`, which would glide with motion off
    window.scrollTo({ top, behavior: effectiveMotion ? 'smooth' : 'instant' });
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
    document.getElementById(FIX_QUEUE_ID)?.scrollIntoView({ behavior: effectiveMotion ? 'smooth' : 'instant', block: 'start' });
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
    // replace, not assign: the dashboard must not stay in history, or Back after signing out
    // could bring it back from the back-forward cache with the records still on screen
    window.location.replace('/adminsignout');
  }, [resolvedTheme]);
  // ---- the Files pop-up ----
  // `files` is the tab it opens on, or null while it is closed. It is held
  // back, like every chapter, until the first authenticator app is confirmed.
  const [files, setFiles] = useState(null);
  const openFiles = useCallback((tab = 'in-use') => setFiles(tab), []);
  const closeFiles = useCallback(() => setFiles(null), []);
  // "Open that entry": the pop-up closes and the entry opens where it lives.
  // A record opens in its chapter's dialog through a record intent (the intent
  // effect above travels there); a contact message has no dialog to open from
  // an intent, so the page travels to the Inbox instead.
  const openEntry = useCallback(({ table, rowId }) => {
    setFiles(null);
    if (table === 'contact_messages') { go('inbox'); return; }
    if (chapterForTable(table)) openRecord(table, rowId);
  }, [go]);
  const actions = useMemo(() => [
    ...(requireSecurityEnrollment ? [] : [
      { id: 'files', label: 'Files', run: () => openFiles('in-use') },
      { id: 'files-broken', label: 'Files: broken links', run: () => openFiles('broken') },
    ]),
    { id: 'signout', label: 'Sign out', hint: 'the film plays', run: signOut },
  ], [signOut, openFiles, requireSecurityEnrollment]);

  const greeting = useMemo(() => greetingFor(), []);
  // First-time enrolment: every chapter but the Earth and Security shows only the request.
  const locked = (chapter) => Boolean(requireSecurityEnrollment) && !OPEN_WHILE_LOCKED.has(chapter.kind);
  const countFor = (chapter) => { const s = data.stats; if (!s || !chapter.table) return null; const key = { hero_content: null, about_content: null, projects: 'projects', internships: 'internships', education: 'education', work_experience: 'workExperience', skills: 'skills', certifications: 'certifications', recommendations: 'recommendations', achievements: 'achievements', leadership: 'leadership', contact_messages: 'messages' }[chapter.table]; return key ? s[key] ?? null : null; };

  return (
    <div className={`voyage${use3d ? ' voyage--webgl' : ' voyage--flat'}`} data-testid="voyage" data-mode={mode}>
      {use3d ? <canvas ref={canvasRef} className="voyage-field" aria-hidden="true" /> : <div className="voyage-flat-sky"><SkyBackground motion={false} /></div>}
      <header className="voyage-bar">
        <span className="voyage-bar__brand">RC · ADMIN</span>
        <span className="voyage-bar__hint">scroll to travel · <kbd>⌘K</kbd> jump anywhere</span>
        <div className="voyage-bar__actions">
          <SkyControls />
          {!requireSecurityEnrollment && (
            <button type="button" className="voyage-bar__button" onClick={() => openFiles('in-use')} aria-label="Files" aria-haspopup="dialog"><Images size={16} aria-hidden="true" /><span>Files</span></button>
          )}
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
                <div className="voyage-chapter__kicker">{String(i).padStart(2, '0')} · {chapterPlace(chapter, names, resolvedTheme)}</div>
                <h2 className="voyage-chapter__title" id={`chapter-${chapter.id}-title`}>{chapter.kind === 'prologue' ? `${greeting}, Raunak` : chapter.name}</h2>
                <p className="voyage-chapter__sub">{chapter.sub}</p>
                {chapter.kind === 'prologue' && <OverReadout signal={overSignal} />}
              </div>
              {/* a locked chapter shows only the enrolment request, so its public link waits too */}
              {!locked(chapter) && <ViewOnSiteLink chapter={chapter} />}
            </div>
            {locked(chapter) ? <EnrolmentLock onGo={() => go('security')} /> : <>
              {chapter.kind === 'bento' && <MissionControl data={bentoData} onGo={go} motion={effectiveMotion} fixQueue={<FixQueuePane fixes={fixes} onReview={go} notify={notify} />} />}
              {chapter.kind === 'deck' && schemaForTable(chapter.table) && (schemaForTable(chapter.table).mode === 'singleton'
                ? <SingletonChapter schema={schemaForTable(chapter.table)} notify={notify} />
                : <DeckChapter schema={schemaForTable(chapter.table)} notify={notify} />)}
              {chapter.kind === 'inbox' && <InboxChapter notify={notify} />}
              {chapter.kind === 'charts' && <AnalyticsChapter notify={notify} motion={effectiveMotion} />}
              {chapter.kind === 'security' && <SecurityChapter notify={notify} onLeave={signOut} />}
              {!BUILT_KINDS.has(chapter.kind) && !(chapter.kind === 'deck' && schemaForTable(chapter.table)) && (
                <div className="voyage-pane voyage-placeholder">
                  <p>{countFor(chapter) !== null ? <><b>{countFor(chapter)}</b> {countFor(chapter) === 1 ? 'item' : 'items'} in this section.</> : 'This chapter is on its way.'}</p>
                </div>
              )}
            </>}
          </section>
        ))}
      </main>

      <LiveRail signal={activeSignal} onJump={jump} names={names} theme={resolvedTheme} />
      <Toast toast={toast} />
      {!requireSecurityEnrollment && <MediaLibraryDialog open={files !== null} initialTab={files || 'in-use'} onClose={closeFiles} onOpenEntry={openEntry} />}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onJump={jump} actions={actions} names={names} theme={resolvedTheme} />
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
