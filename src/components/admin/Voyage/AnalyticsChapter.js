// src/components/admin/Voyage/AnalyticsChapter.js
//
// The Analytics chapter (Orion), built around four questions and an archive:
// "Is it working?", "Where from", "Your work", "Health" and "Reports". Every
// count sits on a water card whose level means one stated thing for its
// group. "This quarter" is a calendar period in New York time: cards fill
// toward a dashed mark at last quarter's level and empty when a new quarter
// starts. Rolling ranges compare items with each other.
//
// Data: one paged read per range through insightsService, reduced by the
// pure insightsModel (contract section 2). Reads start in an idle period a
// few seconds after mount (or earlier if the chapter comes near the
// viewport first), and each range is kept for a few minutes so
// switching back is instant. The range choice is remembered per viewer in
// localStorage (a convenience: it may be unavailable, so every access is
// guarded).

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowDownRight, ArrowUpRight, Clock, Eye, Info, HelpCircle, Laptop, Link2, ExternalLink, RefreshCw, Smartphone, Star, Tablet } from 'lucide-react';
import WaterCard, { CardTag } from './WaterCard';
import ReportsPanel from './ReportsPanel';
import { whenIdle } from './idle';
import { DEFAULT_RANGE, RANGES, RANGE_ORDER, chartDay, windowsFor } from './insightsTime';
import {
  MARK, STEP_ACTIONS, bestRateSource, comparisonLabel, funnelCards, levelFor, mostVisitsSource, phonesLeaveMore,
  projectLists, rankSources, staleSections, starredLeast, startedOn, summarizeWindowSliced, trendPoints, trendSummary, whatChanged,
  DEVICE_MIN_VISITS, PHONE_WARN_RATIO,
} from './insightsModel';
import { loadInsights } from '../../../services/insightsService';
import { failureKind } from '../../../services/voyageRecords';
import './Insights.css';

const TrendChart = lazy(() => import('./TrendChart'));

export const TABS = Object.freeze([
  { id: 'working', label: 'Is it working?' },
  { id: 'sources', label: 'Where from' },
  { id: 'work', label: 'Your work' },
  { id: 'health', label: 'Health' },
  { id: 'reports', label: 'Reports' },
]);
export const RANGE_KEY = 'rc-admin-insights-range';
/** How long a loaded range is reused before it is read again. */
const CACHE_MS = 5 * 60 * 1000;
const TOP_PROJECTS = 12;
/** How long after mount the idle preload of the chart and the data waits. */
export const PRELOAD_DELAY_MS = 2500;

const LOAD_FAILURE = {
  session: 'Your session has expired. Sign in again in a new tab, then try again.',
  permission: 'The numbers could not be read. Enter your authenticator code in a new tab, then try again.',
  network: 'The numbers did not load. Check the connection and try again.',
  unknown: 'The numbers could not be loaded.',
};

/** The remembered range, or the default when storage is empty, blocked or holds something else. */
export function readRange() {
  try {
    const saved = window.localStorage.getItem(RANGE_KEY);
    return RANGES[saved] ? saved : DEFAULT_RANGE;
  } catch {
    return DEFAULT_RANGE;
  }
}
function writeRange(id) {
  try { window.localStorage.setItem(RANGE_KEY, id); } catch { /* storage may be blocked; the choice then lasts this visit */ }
}

const n = (v) => Math.round(v).toLocaleString('en-US');
const pct = (v) => `${Math.round(v * 100)}%`;
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** A sentence part list from the model ({ b } marks the figure) as React nodes. */
const Parts = ({ parts }) => parts.map((p, i) => (typeof p === 'string' ? <React.Fragment key={i}>{p}</React.Fragment> : <b key={i}>{p.b}</b>));

function Pane({ id, title, aside = null, className = '', children }) {
  return (
    <section className={`voyage-pane orion-pane ${className}`.trim()} aria-labelledby={`${id}-h`}>
      <div className="orion-pane__head"><h3 id={`${id}-h`}>{title}</h3>{aside}</div>
      {children}
    </section>
  );
}

const LevelNote = ({ children }) => <p className="ins-level"><i aria-hidden="true" /><span>{children}</span></p>;

/** Arrow keys, Home and End move along a row of buttons and activate the one reached. */
function rovingKeys(e, ids, current, pick, horizontalOnly = false) {
  const keys = horizontalOnly ? ['ArrowLeft', 'ArrowRight', 'Home', 'End'] : ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  e.preventDefault();
  const i = ids.indexOf(current);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : (i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + ids.length) % ids.length;
  pick(ids[next]);
  e.currentTarget.querySelector(`[data-key="${ids[next]}"]`)?.focus();
}

/* ---------- Is it working? ---------- */

function Working({ c }) {
  const { now, before, windows, quarter } = c;
  const cards = funnelCards(now, before, quarter);
  const versus = capital(windows.versus);
  const fall = cards.findIndex((card) => card.tag === 'fall');
  const per100 = (v) => Math.round((v / (now.visits || 1)) * 100);
  const maxCh = Math.max(0, ...now.channels.map((x) => x.count));
  const { points, ticks, unit } = trendPoints(now.series, before.series, windows);
  const curName = quarter ? quarter.short : capital(windows.label);
  const prevName = quarter ? `${windows.lastQuarter.short}, whole quarter` : versus;
  const summary = trendSummary({ points, unit }, curName, prevName);
  const changes = whatChanged({ now, before, windows });

  return (
    <>
      <Pane id="ins-changed" title="What changed" aside={<span className="orion__asof">{comparisonLabel(windows)}</span>}>
        <ul className="ins-changes">
          {changes.map((x, i) => (
            <li key={i} className={`is-${x.dir}`}>
              <span aria-hidden="true">{x.dir === 'up' ? <ArrowUpRight size={14} /> : x.dir === 'down' ? <ArrowDownRight size={14} /> : <Info size={14} />}</span>
              <span><Parts parts={x.parts} />{x.note && <small>{x.note}</small>}</span>
            </li>
          ))}
        </ul>
      </Pane>

      <Pane id="ins-funnel" title="The path to reaching out">
        <div className="wc-row wc-row--4">
          {cards.map((card, i) => {
            const lines = quarter
              ? [i === 0 ? 'So far this quarter' : `${pct(card.rate)} of the step before`, <>Last quarter <b>{n(card.before)}</b> · on pace for <b>{n(card.pace)}</b></>]
              : [i === 0 ? 'Everyone who arrived' : `${pct(card.rate)} of the step before`, <>{versus}: <b>{n(card.before)}</b></>];
            const tag = card.tag === 'fall' ? <CardTag tone="warn">Biggest fall</CardTag> : card.tag === 'beat' ? <CardTag>Beat last quarter</CardTag> : card.tag === 'pace' ? <CardTag>On pace</CardTag> : null;
            return <WaterCard key={card.name} index={i} level={card.level} mark={quarter ? MARK : null} name={card.name} num={n(card.value)} lines={lines} tag={tag} label={`${card.name}: ${n(card.value)}${card.tag === 'fall' ? ', biggest fall' : ''}`} />;
          })}
        </div>
        <LevelNote>{quarter ? 'Water shows progress toward last quarter\'s total, the dashed line. Water above the line beats last quarter.' : 'Water shows the share of all visits that got this far. Visits is always full.'}</LevelNote>
        <p className="ins-lesson">
          Went deeper means the visitor scrolled down to the About section or further, or opened a second page. Looked at your work means Projects, Work experience or Internships. Someone who reached out also counts as having looked at your work. Of every 100 visitors, about <b>{per100(now.work)}</b> looked at your work and <b>{per100(now.reached)}</b> reached out.{' '}
          {fall > 0 ? STEP_ACTIONS[fall] : before.visits ? 'No step lost ground, so the path is doing its job; more visitors is the lever now.' : `With nothing recorded in ${windows.versus}, there is no step to compare yet.`}
        </p>
      </Pane>

      <Pane id="ins-trend" title={unit === 'week' ? 'Visits per week' : 'Visits per day'}>
        <Suspense fallback={<div className="orion-skel ins-chart-skel" role="status" aria-label="Loading the chart" />}>
          <TrendChart points={points} ticks={ticks} curName={curName} prevName={prevName} summary={summary} animate={c.motion} />
        </Suspense>
        <ul className="orion-legend">
          <li><i aria-hidden="true" />{curName}</li>
          <li><i className="is-prev" aria-hidden="true" />{prevName}</li>
        </ul>
      </Pane>

      <Pane id="ins-channels" title="How they reached out">
        <div className="wc-row wc-row--4">
          {now.channels.map((x, i) => {
            const prev = before.channels[i].count;
            return (
              <WaterCard key={x.id} short index={i} level={levelFor({ quarter: Boolean(quarter), cur: x.count, prev, max: maxCh })} mark={quarter ? MARK : null} name={x.name} num={n(x.count)}
                lines={[quarter ? <>Last quarter <b>{n(prev)}</b></> : `${pct(x.count / (now.channels.reduce((s, y) => s + y.count, 0) || 1))} of reach-outs`]}
                label={`${x.name}: ${n(x.count)}`} />
            );
          })}
        </div>
        <LevelNote>{quarter ? 'Water shows progress toward last quarter\'s count.' : 'Water compares the four ways in with each other. The most used is full.'}</LevelNote>
      </Pane>
    </>
  );
}

/* ---------- Where from ---------- */

function Sources({ c }) {
  const { now, before, quarter, windows } = c;
  const rows = rankSources(now.sources);
  const max = Math.max(0, ...rows.map((s) => s.reached));
  const best = bestRateSource(rows);
  const most = mostVisitsSource(rows);
  const oneIn = (s) => Math.round(s.visits / (s.reached || 1));
  let lesson;
  if (!best) lesson = <>Nobody reached out in the {windows.label} yet, so no source can be ranked by reach-outs.{most && <> <b>{most.name}</b> sent the most visits ({n(most.visits)}).</>}</>;
  else if (!most || most.name === best.name) lesson = <><b>{best.name}</b> sends the most visitors and the most willing ones. Keep it current: the headline and featured section there are the first thing a recruiter reads before they click.</>;
  else lesson = <><b>{most.name}</b> sends the most visitors, but <b>{best.name}</b> turns visits into messages best (1 in {n(oneIn(best))}, against {most.reached ? `1 in ${n(oneIn(most))}` : 'none'}). Rank sources by reach-outs, not visits: a small source of people who write to you beats a big one of people who leave.</>;

  return (
    <Pane id="ins-sources" title="Where good visitors come from">
      <div className="wc-row wc-row--5">
        {rows.map((s, i) => {
          const prev = before.sources.find((p) => p.name === s.name) || { reached: 0 };
          return (
            <WaterCard key={s.name} index={i} level={levelFor({ quarter: Boolean(quarter), cur: s.reached, prev: prev.reached, max })} mark={quarter ? MARK : null} name={s.name} num={n(s.reached)} unit="reach-outs"
              lines={[s.reached ? `1 in ${n(oneIn(s))} visits reached out` : 'No reach-outs yet', <>{n(s.visits)} visits{quarter && <> · last quarter <b>{n(prev.reached)}</b> reach-outs</>}</>]}
              tag={best && s.name === best.name ? <CardTag>Best rate</CardTag> : null}
              label={`${s.name}: ${n(s.reached)} reach-outs from ${n(s.visits)} visits${best && s.name === best.name ? ', best rate' : ''}`} />
          );
        })}
      </div>
      <LevelNote>{quarter ? 'Water shows each source\'s reach-outs against its own count last quarter.' : 'Water compares reach-outs. The source that brought the most is full.'}</LevelNote>
      <p className="ins-lesson">{lesson}</p>
      <p className="ins-lesson"><b>Direct or unknown</b> means the browser did not say where the visitor came from: a typed address, a bookmark, a link in an email or a chat app. A resume PDF link lands here too.</p>
    </Pane>
  );
}

/* ---------- Your work ---------- */

function Work({ c, showAll, onToggleAll }) {
  const { now, before, quarter, windows, firstProjectOpen } = c;
  const { opened, quiet } = projectLists(now.projects);
  const shown = showAll ? opened : opened.slice(0, TOP_PROJECTS);
  const max = opened[0]?.opens || 0;
  const low = starredLeast(now.projects);
  const contact = now.home.sections.find((s) => s.id === 'contact');
  let recorded = null;
  if (firstProjectOpen === null) recorded = 'Project opens are recorded once the new tracking is live. None are stored yet, so every project is listed as not opened.';
  else if (firstProjectOpen > windows.current.from) recorded = `Recorded from ${startedOn(firstProjectOpen)}; visits before that day have no project events.`;

  return (
    <>
      <Pane id="ins-projects" title="Projects people opened">
        {recorded && <p className="orion-sparse"><Info size={14} aria-hidden="true" /><span>{recorded}</span></p>}
        {shown.length > 0 && (
          <div className="wc-row wc-row--projects">
            {shown.map((p, i) => {
              const prev = before.projects.find((x) => x.id === p.id) || { opens: 0 };
              return (
                <WaterCard key={p.id} index={i} title level={levelFor({ quarter: Boolean(quarter), cur: p.opens, prev: prev.opens, max })} mark={quarter ? MARK : null}
                  name={<>{p.starred && <Star size={12} className="wc__star" aria-hidden="true" />}<span>{p.title}</span></>}
                  num={n(p.opens)} unit={p.opens === 1 ? 'open' : 'opens'} lines={quarter ? [<>Last quarter <b>{n(prev.opens)}</b></>] : []}
                  chips={<><span><Link2 size={12} aria-hidden="true" />GitHub <b>{n(p.repo)}</b></span>{p.hasDemo && <span><ExternalLink size={12} aria-hidden="true" />Demo <b>{n(p.demo)}</b></span>}</>}
                  label={`${p.title}${p.starred ? ', starred' : ''}: opened ${n(p.opens)} times, GitHub followed ${n(p.repo)} times${p.hasDemo ? `, demo ${n(p.demo)} times` : ''}`} />
              );
            })}
          </div>
        )}
        {opened.length > TOP_PROJECTS && (
          <button type="button" className="voyage-bar__button ins-more" onClick={onToggleAll} aria-expanded={showAll}>
            <span>{showAll ? `Show the top ${TOP_PROJECTS}` : `Show all ${opened.length} opened`}</span>
          </button>
        )}
        {quiet.length > 0 && (
          <div>
            <h4 className="wc__name ins-quiet__title">Not opened in this range</h4>
            <ul className="ins-quiet">{quiet.map((p) => <li key={p.id}>{p.title}</li>)}</ul>
          </div>
        )}
        {shown.length > 0 && <LevelNote>{quarter ? 'Water shows each project\'s opens against its own count last quarter.' : 'Water compares projects. The most opened is full.'}</LevelNote>}
        <p className="ins-lesson">
          <b>Opened</b> counts a card flipped or a project page visited. <b>GitHub</b> and <b>Demo</b> count links followed from it. A project opened often but rarely followed to GitHub may need a clearer first line.
          {low && opened.length > 0 && <> Your starred project opened least is <b>{low.title}</b> ({n(low.opens)}); if it matters, move it up.</>}
        </p>
      </Pane>

      <Pane id="ins-sections" title="How far down the home page">
        {now.home.visits > 0 ? (
          <>
            <div className="wc-row wc-row--4 wc-row--sections">
              {now.home.sections.map((s, i) => (
                <WaterCard key={s.id} short index={i} level={s.share} name={s.name} num={pct(s.share)} lines={[`of home page visits reached ${s.name}`]} label={`${s.name}: ${pct(s.share)} of home page visits`} />
              ))}
            </div>
            <LevelNote>Water shows the share of home page visits that scrolled this far, in every range.</LevelNote>
            <p className="ins-lesson">Measured over the <b>{n(now.home.visits)}</b> visits that opened the home page. Each section keeps fewer readers than the one before; that is normal. Contact is last and reached by <b>{pct(contact.share)}</b>, so the people most ready to write may never see it. A contact link near Projects reaches far more of them.</p>
          </>
        ) : (
          <p className="orion-sparse"><Info size={14} aria-hidden="true" /><span>No visit in the {windows.label} opened the home page.</span></p>
        )}
      </Pane>
    </>
  );
}

/* ---------- Health ---------- */

const DEVICE_ICON = { desktop: Laptop, phone: Smartphone, tablet: Tablet, unknown: HelpCircle };

function Health({ c }) {
  const { now, windows, firstEngaged, freshness, nowMs } = c;
  const laptop = now.devices.find((d) => d.id === 'desktop');
  const phone = now.devices.find((d) => d.id === 'phone');
  const warnFor = (d) => (d.id === 'phone' || d.id === 'tablet') && d.quick !== null && laptop.quick !== null && d.measured >= DEVICE_MIN_VISITS && laptop.measured >= DEVICE_MIN_VISITS && d.quick > laptop.quick * PHONE_WARN_RATIO;
  const stale = staleSections(freshness, nowMs);
  let measuredNote = null;
  if (firstEngaged === null) measuredNote = 'Measured once the new tracking is live.';
  else if (firstEngaged > windows.current.from) measuredNote = `Measured from ${startedOn(firstEngaged)} when engagement tracking started.`;
  const phonesMore = phonesLeaveMore(now.devices);

  return (
    <div className="ins-grid ins-grid--split">
      <Pane id="ins-devices" title="Quick leaves by device">
        {measuredNote && <p className="orion-sparse"><Info size={14} aria-hidden="true" /><span>{measuredNote}</span></p>}
        <ul className="ins-rows">
          {now.devices.map((d) => {
            const Icon = DEVICE_ICON[d.id];
            return (
              <li key={d.id}>
                <span className="ins-rows__icon" aria-hidden="true"><Icon size={16} /></span>
                <span className="ins-rows__text"><b>{d.name}</b><span>{d.note} · {pct(d.share)} of visits</span></span>
                <span className={`ins-rows__num${warnFor(d) ? ' is-warn' : ''}`}>{d.quick === null ? 'None' : pct(d.quick)}<small>{d.quick === null ? 'measured yet' : 'left at once'}</small></span>
              </li>
            );
          })}
        </ul>
        <p className="ins-lesson">
          A <b>quick leave</b> is a visit that stayed on the first screen and left within ten seconds.
          {phone.quick !== null && laptop.quick !== null && <> Phones leave {phonesMore ? <><b>{(phone.quick / (laptop.quick || 1)).toFixed(1)} times</b> as often as laptops</> : 'about as often as laptops'}.</>}
          {' '}Open the site on your phone and time the first screen: if the name and the one-line pitch are not readable within two seconds, that is the fix.
        </p>
      </Pane>

      <Pane id="ins-stale" title="Sections that look stale">
        {stale.stale.length > 0 ? (
          <ul className="ins-rows">
            {stale.stale.map((s) => (
              <li key={s.section}>
                <span className="ins-rows__icon" aria-hidden="true"><Clock size={16} /></span>
                <span className="ins-rows__text"><b>{s.section}</b><span>Last edited {n(s.days)} days ago</span></span>
                <span className="ins-rows__num is-warn">{n(s.days)}<small>days</small></span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="orion-sparse"><Info size={14} aria-hidden="true" /><span>{stale.fresh ? 'Every section was edited in the last 90 days.' : 'Edit dates could not be read.'}</span></p>
        )}
        <p className="ins-lesson">{stale.stale.length > 0 && stale.fresh > 0 ? `${stale.fresh} other ${stale.fresh === 1 ? 'section was' : 'sections were'} edited in the last 90 days. ` : ''}A recruiter cannot see edit dates, but they notice a certificate list that stops two years ago. Ninety days without an edit is the flag.</p>
      </Pane>

      <Pane id="ins-unmeasured" title="Not measured yet" className="ins-wide">
        <div className="orion-unmeasured">
          <Eye size={16} aria-hidden="true" />
          <p><b>Slow loads and script errors are not recorded.</b> The site sends no error events today, so a broken page shows up here only as quick leaves. A small error event (page and message, no visitor data) would fill this panel; it is not built yet.</p>
        </div>
      </Pane>
    </div>
  );
}

/* ---------- the chapter ---------- */

function Skeleton() {
  return (
    <div className="ins-grid" role="status" aria-label="Loading the numbers">
      <div className="voyage-pane orion-pane"><div className="orion-skel ins-skel-line" /><div className="orion-skel ins-skel-line ins-skel-line--short" /></div>
      <div className="voyage-pane orion-pane"><div className="wc-row wc-row--4">{[0, 1, 2, 3].map((i) => <div key={i} className="orion-skel ins-skel-card" />)}</div></div>
    </div>
  );
}

function Empty({ windows, before, onLonger }) {
  const quarter = windows.quarter;
  return (
    <Pane id="ins-empty" title={quarter ? 'No visits this quarter yet' : `No visits in the ${windows.label}`}>
      <div className="orion-empty">
        <p>Visits appear here as the public site records them. {before.visits ? `${n(before.visits)} visits were recorded in ${windows.versus}.` : `Nothing was recorded in ${windows.versus} either.`} Analytics runs only on the live build, with tracking switched on.</p>
        {onLonger && <button type="button" className="voyage-bar__button" onClick={onLonger}><span>Show 12 months</span></button>}
      </div>
    </Pane>
  );
}

/**
 * @param {object} props
 * @param {(text: string, tone?: string) => void} props.notify toast for the Reports tab.
 * @param {boolean} [props.motion] false under reduced motion: the water shows its level at once and the waves stand still.
 * @param {() => number} [props.clock] the current time (tests pin it).
 */
export default function AnalyticsChapter({ notify, motion = true, clock = Date.now }) {
  const rootRef = useRef(null);
  const [near, setNear] = useState(false);
  const [tab, setTab] = useState('working');
  const [rangeId, setRangeId] = useState(readRange);
  const [showAll, setShowAll] = useState(false);
  const [state, setState] = useState({ status: 'idle', data: null, error: null, rangeId: null });
  const [hidden, setHidden] = useState(typeof document !== 'undefined' && document.hidden);
  const cache = useRef(new Map());
  const built = useRef(new WeakMap());
  const [model, setModel] = useState(null);
  const request = useRef(0);

  // Preload while the voyage is at rest: a few seconds after mount, in an idle
  // period, fetch the chart's chunk and the remembered range's data, so neither
  // is parsed nor fetched while the page is scrolling toward this chapter.
  useEffect(() => whenIdle(() => {
    import('./TrendChart').catch(() => { /* the lazy chart retries when it renders */ });
    setNear(true);
  }, { delay: PRELOAD_DELAY_MS, timeout: 3000 }), []);

  // a fast scroller can arrive before the idle preload: start then instead
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // waves stop while the tab is hidden
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const load = useCallback(async (id, force = false) => {
    const cached = cache.current.get(id);
    const at = clock();
    if (!force && cached && at - cached.at < CACHE_MS) { setState({ status: 'ready', data: cached.data, error: null, rangeId: id }); return; }
    const mine = ++request.current;
    setState((s) => ({ status: 'loading', data: s.data, error: null, rangeId: id }));
    try {
      const windows = windowsFor(id, at);
      const raw = await loadInsights(windows);
      const data = { ...raw, windows, nowMs: at };
      cache.current.set(id, { at, data });
      if (mine === request.current) setState({ status: 'ready', data, error: null, rangeId: id });
    } catch (error) {
      if (mine === request.current) setState({ status: 'error', data: null, error, rangeId: id });
    }
  }, [clock]);

  useEffect(() => { if (near) load(rangeId); }, [near, rangeId, load]);

  const pickRange = (id) => { setRangeId(id); writeRange(id); };

  // Build the model off the scroll path: the rows are folded in slices of about
  // 8 ms that yield to the browser, so a large range never becomes one long
  // task. The skeleton stays until both windows are summarised; a built model
  // is kept per loaded data object, so a cached range shows at once.
  useEffect(() => {
    if (state.status !== 'ready' || !state.data) return undefined;
    const data = state.data;
    const hit = built.current.get(data);
    if (hit) { setModel(hit); return undefined; }
    let stopped = false;
    const cancelled = () => stopped;
    const optionsFor = (w) => ({ start: w.start, days: w.days, projects: data.projects, quickFrom: data.firstEngaged });
    (async () => {
      const now = await summarizeWindowSliced(data.current, optionsFor(data.windows.current), { cancelled });
      const before = now && await summarizeWindowSliced(data.before, optionsFor(data.windows.before), { cancelled });
      if (!before || stopped) return;
      const next = { data, now, before };
      built.current.set(data, next);
      setModel(next);
    })();
    return () => { stopped = true; };
  }, [state]);

  const c = useMemo(() => {
    if (state.status !== 'ready' || !model || model.data !== state.data) return null;
    const { windows, firstEngaged, firstProjectOpen, freshness, nowMs, truncated } = state.data;
    return { windows, quarter: windows.quarter, now: model.now, before: model.before, firstEngaged, firstProjectOpen, freshness, nowMs, truncated, motion };
  }, [state, model, motion]);

  const tabIds = TABS.map((t) => t.id);
  const quarterOn = c?.quarter && tab !== 'reports';
  let body;
  if (tab === 'reports') body = near ? <ReportsPanel now={clock()} notify={notify} /> : null;
  else if (state.status === 'error') {
    body = (
      <div className="deck__error" role="alert">
        <AlertCircle size={16} aria-hidden="true" />
        <p>{LOAD_FAILURE[failureKind(state.error)] || LOAD_FAILURE.unknown}</p>
        <button type="button" className="voyage-bar__button" onClick={() => load(rangeId, true)}><RefreshCw size={14} /><span>Try again</span></button>
      </div>
    );
  } else if (!c || state.status === 'loading') body = <Skeleton />;
  else if (c.now.visits === 0 && tab !== 'health') body = <Empty windows={c.windows} before={c.before} onLonger={rangeId !== '12m' ? () => pickRange('12m') : null} />;
  else if (tab === 'working') body = <Working c={c} />;
  else if (tab === 'sources') body = <Sources c={c} />;
  else if (tab === 'work') body = <Work c={c} showAll={showAll} onToggleAll={() => setShowAll((v) => !v)} />;
  else body = <Health c={c} />;

  return (
    <div ref={rootRef} className={`orion${hidden ? ' is-tab-hidden' : ''}`} data-motion={motion ? 'full' : 'reduced'} data-testid="analytics-chapter">
      <div className="orion__bar">
        <div className="orion__tabs" role="tablist" aria-label="Analytics views" onKeyDown={(e) => rovingKeys(e, tabIds, tab, setTab, true)}>
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" id={`ins-tab-${t.id}`} data-key={t.id} aria-selected={tab === t.id} aria-controls="ins-panel" tabIndex={tab === t.id ? 0 : -1}
              className={`inbox__filter${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        {tab !== 'reports' && (
          <div className="orion__range" role="radiogroup" aria-label="Time range" onKeyDown={(e) => rovingKeys(e, RANGE_ORDER, rangeId, pickRange)}>
            {RANGE_ORDER.map((id) => (
              <button key={id} type="button" role="radio" data-key={id} aria-checked={rangeId === id} tabIndex={rangeId === id ? 0 : -1} onClick={() => pickRange(id)}>{RANGES[id].button}</button>
            ))}
          </div>
        )}
        {quarterOn && (
          <div className="ins-quarter">
            <div className="ins-quarter__top"><b>{c.quarter.short} · {c.quarter.label}</b><span>Day {c.quarter.day} of {c.quarter.length}</span></div>
            <div className="ins-quarter__track" role="progressbar" aria-label="Quarter elapsed" aria-valuemin={1} aria-valuemax={c.quarter.length} aria-valuenow={c.quarter.day}>
              <b style={{ width: `${(c.quarter.day / c.quarter.length) * 100}%` }} />
            </div>
            <p>Cards fill toward the dashed line, last quarter's total. They empty on {chartDay(c.quarter.next)} and start filling again; the visits themselves stay in the database.</p>
          </div>
        )}
        {c?.truncated && tab !== 'reports' && <p className="orion-sparse"><Info size={14} aria-hidden="true" /><span>This range holds more events than one read takes (60,000, counted from the oldest), so the newest visits are missing from these counts. A shorter range gives exact numbers.</span></p>}
      </div>
      <div id="ins-panel" role="tabpanel" aria-labelledby={`ins-tab-${tab}`} className="ins-grid" tabIndex={-1}>
        {body}
      </div>
    </div>
  );
}
