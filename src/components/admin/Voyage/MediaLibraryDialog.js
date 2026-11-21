// src/components/admin/Voyage/MediaLibraryDialog.js
//
// The Files pop-up: every file in the portfolio's storage buckets, which
// entries use each one, and a safe way to delete what nothing uses. It opens
// from the Files button in the top bar and from Cmd+K ("Files", or "Files:
// broken links" straight onto that tab), and replaces the old Media library
// chapter, which has left the scroll.
//
// Three tabs (rules in mediaModel.js):
//   In use         grouped by section; each row names the entries using the
//                  file. Delete is blocked with a message that names the
//                  entry and offers "Open that entry".
//   Not connected  safe to delete: multi-select and a confirmation listing
//                  the files and their total. Immediately before deleting,
//                  every reference is read again; a file that some entry
//                  now uses is kept and the report names it ("3 files
//                  deleted, 1 kept"). If that read misses a section, nothing
//                  is deleted.
//   Broken links   entries pointing at files that are no longer in storage,
//                  with "Open that entry" and "Copy path".
// If any section could not be read when the list loaded, a banner names it
// with Try again and delete is off everywhere.
//
// Layout: from 1100 px a preview pane sits beside the list; below that a
// row opens the same preview in a lightbox inside the pop-up. Under 768 px
// the pop-up fills the screen. Thumbnails are the real files, loaded lazily
// from their storage links (private files through the signed links the
// snapshot made); anything that is not an image, or fails to load, shows a
// plain mark with its extension. Links are rendered only for http and https.
//
// Like the record dialog it is portalled into <body> under the voyage
// tokens (.record-backdrop) and owns the keyboard while open: Tab stays in
// the top layer, Escape closes the top layer first (a confirmation, the
// in-use message, the lightbox) and then the pop-up, the page behind does
// not scroll, and focus returns to whatever opened it.

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowRight, Copy, ExternalLink, Info, Link2Off, RefreshCw, Search, Trash2, X } from 'lucide-react';
import useModalFocus from './useModalFocus';
import {
  PAGE_SIZE, SORTS, TABS, brokenText, bytesLabel, classify, dayLabel, deletionReport, entryLabel, fileMark, filterBroken, filterFiles,
  groupBroken, groupBySection, hasThumbnail, joinNames, planDeletion, safeHttpUrl, sortFiles, summarize, totalBytes, usedByText,
} from './mediaModel';
import { MEDIA_LIBRARY_BUCKETS, REFERENCE_TABLES, createMediaSignedUrl, deleteMediaFiles, getMediaLibrarySnapshot, readReferences } from '../../../services/mediaLibraryService';
import './MediaLibrary.css';

/** From this width the preview pane sits beside the list; below it a row opens the lightbox. */
export const WIDE_QUERY = '(min-width: 1100px)';
/** How long a copied or opened private link works. */
const PRIVATE_LINK_SECONDS = 300;
const STATUS_MS = 3200;

/** True while the media query matches; false where matchMedia is missing (tests, old browsers). */
function useMediaQuery(query) {
  const read = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(read);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener?.('change', onChange);
    return () => list.removeEventListener?.('change', onChange);
  }, [query]);
  return matches;
}

/** The real picture, lazily, or the file's plain mark when there is none or it fails to load. */
function Thumb({ file, large = false }) {
  const [failed, setFailed] = useState(false);
  const src = hasThumbnail(file) && !failed ? safeHttpUrl(file.previewUrl) : null;
  return (
    <span className={`media-thumb${large ? ' media-thumb--large' : ''}${src ? '' : ' is-mark'}`} aria-hidden="true">
      {src ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <span className="media-thumb__mark">{fileMark(file)}</span>}
    </span>
  );
}

/** The plain-text status a file row and the preview carry. */
function statusLine(file, moved) {
  if (file.state === 'in-use') return { tone: moved ? 'warn' : 'quiet', text: `${moved ? 'Moved back: now used by' : 'Used by'} ${usedByText(file.entries)}` };
  if (file.duplicate) return { tone: 'warn', text: `Possible duplicate of ${file.duplicate.name}, which is in use` };
  return null;
}

function FileRow({ file, focused, moved, selectable, selected, onToggle, onPick, onDelete, deleteOff }) {
  const status = statusLine(file, moved);
  const meta = [file.bucketLabel, bytesLabel(file.size), dayLabel(file.updatedAt)].filter(Boolean).join(' · ');
  return (
    <li className={`media-row${focused ? ' is-focused' : ''}${selected ? ' is-selected' : ''}`} data-file={file.id}>
      {selectable && (
        <label className="media-row__check">
          <input type="checkbox" checked={selected} disabled={deleteOff} onChange={() => onToggle(file)} aria-label={`Select ${file.name}`} />
        </label>
      )}
      <button type="button" className="media-row__main" onClick={(e) => onPick(file, e.currentTarget)} aria-label={`${file.name}, ${meta}${status ? `, ${status.text}` : ''}`}>
        <Thumb file={file} />
        <span className="media-row__text">
          <span className="media-row__name">{file.name}</span>
          <span className="media-row__meta">{meta}</span>
          {status && <span className={`media-row__status media-row__status--${status.tone}`}>{status.text}</span>}
        </span>
      </button>
      <button
        type="button"
        className="media-icon-button media-row__delete"
        onClick={(e) => onDelete(file, e.currentTarget)}
        disabled={file.state !== 'in-use' && deleteOff}
        aria-label={file.state === 'in-use' ? `Delete ${file.name} (in use)` : `Delete ${file.name}`}
        title={file.state !== 'in-use' && deleteOff ? 'Delete is off until every section is checked' : undefined}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

function BrokenRow({ link, onOpenEntry, onCopy }) {
  return (
    <li className="media-row media-row--broken" data-broken={link.id}>
      <span className="media-thumb is-mark is-broken" aria-hidden="true"><Link2Off size={18} /></span>
      <div className="media-row__text">
        <span className="media-row__name">{link.title}</span>
        <span className="media-row__meta">{brokenText(link)}</span>
        <code className="media-row__path">{link.fullPath}</code>
        <span className="media-row__actions">
          <button type="button" className="voyage-bar__button voyage-bar__button--primary" onClick={() => onOpenEntry(link)}><ArrowRight size={14} aria-hidden="true" /><span>Open that entry</span></button>
          <button type="button" className="voyage-bar__button" onClick={() => onCopy(link.fullPath, 'Path copied')}><Copy size={14} aria-hidden="true" /><span>Copy path</span></button>
        </span>
      </div>
    </li>
  );
}

/** The preview of one file: the picture or its mark, the facts, who uses it, and its actions. */
function Preview({ file, moved, deleteOff, onOpenEntry, onCopyLink, onOpenFile, onDelete }) {
  if (!file) return <p className="media-preview__none">Pick a file to see it here.</p>;
  const status = statusLine(file, moved);
  const publicUrl = !file.isPrivate ? safeHttpUrl(file.previewUrl) : null;
  return (
    <div className="media-preview">
      <div className="media-preview__picture"><Thumb key={file.id} file={file} large /></div>
      <h4 className="media-preview__name">{file.name}</h4>
      <p className={`media-preview__status media-row__status--${status?.tone || 'quiet'}`}>{file.state === 'in-use' ? status.text : status ? `Not connected · ${status.text}` : 'Not connected'}</p>
      <dl className="media-preview__facts">
        <div><dt>Bucket</dt><dd>{file.bucketLabel}</dd></div>
        <div><dt>Size</dt><dd>{bytesLabel(file.size)}</dd></div>
        {dayLabel(file.updatedAt) && <div><dt>Uploaded</dt><dd>{dayLabel(file.updatedAt)}</dd></div>}
        <div><dt>Path</dt><dd><code>{file.path}</code></dd></div>
      </dl>
      <h5 className="media-preview__label">Used by</h5>
      {file.entries.length ? (
        <ul className="media-preview__entries">
          {file.entries.map((entry) => (
            <li key={`${entry.table}:${entry.rowId}`}>
              <button type="button" className="media-entry" onClick={() => onOpenEntry(entry)} aria-label={`Open that entry: ${entryLabel(entry)}`}>
                <span><span className="media-entry__section">{entry.section}</span><span className="media-entry__title">{entry.title}</span></span>
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="media-preview__none">No entry points at this file.</p>}
      {file.isPrivate && <p className="media-preview__none">Private file: Copy link makes a link that works for five minutes.</p>}
      <div className="media-preview__actions">
        <button type="button" className="voyage-bar__button" onClick={() => onCopyLink(file)}><Copy size={14} aria-hidden="true" /><span>Copy link</span></button>
        {publicUrl
          ? <a className="voyage-bar__button" href={publicUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden="true" /><span>Open</span></a>
          : <button type="button" className="voyage-bar__button" onClick={() => onOpenFile(file)}><ExternalLink size={14} aria-hidden="true" /><span>Open</span></button>}
        <button type="button" className="voyage-bar__button voyage-bar__button--quiet" onClick={(e) => onDelete(file, e.currentTarget)} disabled={file.state !== 'in-use' && deleteOff}><Trash2 size={14} aria-hidden="true" /><span>Delete</span></button>
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {'in-use'|'not-connected'|'broken'} [props.initialTab]
 * @param {() => void} props.onClose
 * @param {(entry: {table: string, rowId: string|number, section: string, title: string}) => void} props.onOpenEntry
 *   closes the pop-up and opens that entry (the page decides how: its record dialog, or its chapter).
 */
export default function MediaLibraryDialog({ open, initialTab = 'in-use', onClose, onOpenEntry }) {
  const id = useId();
  const panelRef = useRef(null), layerRef = useRef(null), closeRef = useRef(null), layerOpener = useRef(null);
  // The focus trap follows the top layer: the confirmation, the message or the lightbox while one is open.
  const trapRef = useMemo(() => ({ get current() { return layerRef.current || panelRef.current; } }), []);
  const wide = useMediaQuery(WIDE_QUERY);

  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState('');
  const [bucket, setBucket] = useState('all');
  const [sort, setSort] = useState('newest');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState(() => new Set());
  const [focusId, setFocusId] = useState(null);
  const [layer, setLayer] = useState(null);   // { kind: 'blocked'|'confirm'|'lightbox', ... }
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [moved, setMoved] = useState(() => new Set());
  const [status, setStatus] = useState('');
  const alive = useRef(true);
  const loadSeq = useRef(0);

  const load = useCallback(() => {
    const seq = loadSeq.current += 1;
    setLoading(true); setError(null);
    return getMediaLibrarySnapshot()
      .then((snap) => { if (alive.current && seq === loadSeq.current) { setSnapshot(snap); setLoading(false); } })
      .catch(() => { if (alive.current && seq === loadSeq.current) { setError('The files could not be read.'); setLoading(false); } });
  }, []);

  // Every opening starts fresh on the asked tab and reads storage again.
  useEffect(() => {
    if (!open) return undefined;
    alive.current = true;
    setTab(initialTab); setQuery(''); setBucket('all'); setSort('newest'); setSelected(new Set()); setLayer(null); setReport(null); setMoved(new Set()); setFocusId(null); setSnapshot(null);
    load();
    return () => { alive.current = false; };
  }, [open, initialTab, load]);

  useEffect(() => { setLimit(PAGE_SIZE); }, [tab, query, bucket, sort]);
  useEffect(() => { if (!status) return undefined; const t = setTimeout(() => setStatus(''), STATUS_MS); return () => clearTimeout(t); }, [status]);

  const view = useMemo(() => classify(snapshot || {}), [snapshot]);
  const totals = useMemo(() => summarize(view), [view]);
  const deleteOff = view.refsFailed;

  const shownFiles = useMemo(() => {
    if (tab === 'broken') return [];
    return sortFiles(filterFiles(tab === 'in-use' ? view.inUse : view.notConnected, { query, bucket }), sort);
  }, [view, tab, query, bucket, sort]);
  const shownBroken = useMemo(() => (tab === 'broken' ? filterBroken(view.broken, { query, bucket }) : []), [view, tab, query, bucket]);
  const visibleFiles = shownFiles.slice(0, limit);
  // In use is shown grouped by section, so its first row on screen is the first of the first group
  const groups = tab === 'in-use' ? groupBySection(visibleFiles) : [];
  const displayFiles = tab === 'in-use' ? groups.flatMap((g) => g.files) : visibleFiles;
  const fileById = useMemo(() => new Map(view.files.map((f) => [f.id, f])), [view]);
  const notConnectedById = useMemo(() => new Map(view.notConnected.map((f) => [f.id, f])), [view]);
  const selectedFiles = view.notConnected.filter((f) => selected.has(f.id));
  const focused = (focusId && (notConnectedById.get(focusId) || fileById.get(focusId))) || (wide ? displayFiles[0] : null) || null;

  // ---- layers: focus moves into a new layer and back to what opened it ----
  const openLayer = useCallback((next, opener) => { layerOpener.current = opener || document.activeElement; setLayer(next); }, []);
  const closeLayer = useCallback(() => {
    setLayer(null);
    const back = layerOpener.current; layerOpener.current = null;
    setTimeout(() => { if (back?.isConnected && !back.disabled) back.focus(); else closeRef.current?.focus(); }, 0);
  }, []);
  useEffect(() => { if (layer) layerRef.current?.querySelector('[data-autofocus]')?.focus(); }, [layer]);

  const onEscape = useCallback(() => {
    if (busy) return;
    if (layer) closeLayer(); else onClose();
  }, [busy, layer, closeLayer, onClose]);
  useModalFocus(open, trapRef, { onEscape, initialFocus: () => closeRef.current });

  // ---- actions ----
  const pick = useCallback((file, opener) => {
    setFocusId(file.id);
    if (!wide) openLayer({ kind: 'lightbox', id: file.id }, opener);
  }, [wide, openLayer]);

  const askDelete = useCallback((file, opener) => {
    if (file.state === 'in-use') { openLayer({ kind: 'blocked', file }, opener); return; }
    if (deleteOff) return;
    openLayer({ kind: 'confirm', files: [file] }, opener);
  }, [deleteOff, openLayer]);

  const toggle = useCallback((file) => setSelected((prev) => { const next = new Set(prev); if (next.has(file.id)) next.delete(file.id); else next.add(file.id); return next; }), []);
  const allShownSelected = tab === 'not-connected' && visibleFiles.length > 0 && visibleFiles.every((f) => selected.has(f.id));
  const toggleAllShown = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allShownSelected) visibleFiles.forEach((f) => next.delete(f.id)); else visibleFiles.forEach((f) => next.add(f.id));
    return next;
  });

  const openEntry = useCallback((entry) => {
    if (busy) return;
    onOpenEntry?.({ table: entry.table, rowId: entry.rowId, section: entry.section, title: entry.title });
  }, [busy, onOpenEntry]);

  const copy = useCallback(async (text, done) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(text);
      if (alive.current) setStatus(done);
    } catch {
      if (alive.current) setStatus('It could not be copied. Select the text and copy it instead.');
    }
  }, []);

  // A private file's link is signed fresh, so it works for five minutes from now.
  const linkFor = useCallback(async (file) => (file.isPrivate ? createMediaSignedUrl(file.bucketId, file.path, PRIVATE_LINK_SECONDS) : file.previewUrl), []);
  const copyLink = useCallback(async (file) => {
    try {
      const url = safeHttpUrl(await linkFor(file));
      if (!url) throw new Error('no link');
      await copy(url, 'Link copied');
    } catch {
      if (alive.current) setStatus('A link to this file could not be made. Try again.');
    }
  }, [copy, linkFor]);
  // The tab opens synchronously (a window opened after an await may be blocked as a pop-up) and is cut off
  // from this page before it is sent to the signed link.
  const openFile = useCallback(async (file) => {
    const tabWindow = window.open('', '_blank');
    if (tabWindow) tabWindow.opener = null;
    try {
      const url = safeHttpUrl(await linkFor(file));
      if (!url) throw new Error('no link');
      if (tabWindow) tabWindow.location.replace(url);
    } catch {
      tabWindow?.close();
      if (alive.current) setStatus('A link to this file could not be made. Try again.');
    }
  }, [linkFor]);

  const confirmDelete = useCallback(async (files) => {
    setBusy(true);
    let outcome;
    try {
      const fresh = await readReferences().catch(() => null);
      const plan = planDeletion(files, fresh || {});
      if (plan.blocked) {
        outcome = { title: 'Nothing was deleted', tone: 'bad', lines: [{ kind: 'blocked', id: 'blocked', name: '', text: `The last check could not read ${joinNames(plan.failedSections) || 'every section'}, so no file was deleted. Try again in a moment.` }] };
      } else {
        const result = await deleteMediaFiles(plan.toDelete, { listedIds: view.listedIds });
        outcome = deletionReport({ deleted: result.deleted, kept: plan.kept, failed: result.failed });
        if (plan.kept.length && alive.current) setMoved(new Set(plan.kept.map((k) => k.file.id)));
      }
    } finally {
      if (alive.current) {
        setBusy(false);
        setReport(outcome || { title: 'Nothing was deleted', tone: 'bad', lines: [] });
        setSelected(new Set());
        setLayer(null);
        layerOpener.current = null;
        setTimeout(() => closeRef.current?.focus(), 0);
      }
    }
    if (alive.current) await load();
  }, [view.listedIds, load]);

  if (!open) return null;

  const tabCount = { 'in-use': view.inUse.length, 'not-connected': view.notConnected.length, broken: view.broken.length };
  const bucketsShown = snapshot?.buckets?.length ? snapshot.buckets : MEDIA_LIBRARY_BUCKETS;
  const perBucket = view.files.reduce((acc, f) => ({ ...acc, [f.bucketId]: (acc[f.bucketId] || 0) + 1 }), {});
  const ready = Boolean(snapshot) && !error;
  const onTabKey = (e) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : null;
    if (next === null) return;
    e.preventDefault();
    setTab(TABS[next].id);
    document.getElementById(`${id}-tab-${TABS[next].id}`)?.focus();
  };

  const lightboxFile = layer?.kind === 'lightbox' ? (notConnectedById.get(layer.id) || fileById.get(layer.id)) : null;
  const previewProps = { deleteOff, onOpenEntry: openEntry, onCopyLink: copyLink, onOpenFile: openFile, onDelete: askDelete };

  return createPortal(
    <div className="record-backdrop media-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy && !layer) onClose(); }}>
      <div ref={panelRef} className="record-dialog media-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-summary`} data-testid="media-library">
        <header className="record-dialog__head media-dialog__head">
          <div className="record-dialog__titles media-dialog__titles">
            <h3 id={`${id}-title`}>Files</h3>
            <p id={`${id}-summary`} className="media-summary">
              {ready ? <>
                <span><b>{totals.count}</b> {totals.count === 1 ? 'file' : 'files'}</span>
                <span className="media-summary__used"><b>{bytesLabel(totals.bytes)}</b> of 1 GB used
                  <span className="media-meter" aria-hidden="true"><span style={{ width: `${Math.max(totals.bytes ? 1 : 0, Math.round(totals.quotaShare * 100))}%` }} /></span>
                </span>
                <span><b className={totals.notConnectedCount ? 'is-warn' : ''}>{totals.notConnectedCount}</b> not connected ({bytesLabel(totals.notConnectedBytes)})</span>
              </> : <span>Images and documents behind every section.</span>}
            </p>
          </div>
          <button type="button" ref={closeRef} className="record-dialog__close" onClick={onClose} disabled={busy} aria-label="Close files"><X size={18} /></button>
        </header>

        {(report || (ready && view.refsFailed) || (ready && view.failedBuckets.length > 0)) && (
          <div className="record-dialog__banners media-dialog__banners">
            {report && (
              <div className={`record-banner record-banner--${report.tone === 'good' ? 'good' : report.tone === 'bad' ? 'bad' : 'warn'}`} role="status" data-testid="media-report">
                <span className="record-banner__icon" aria-hidden="true">{report.tone === 'good' ? <Info size={18} /> : <AlertTriangle size={18} />}</span>
                <div className="record-banner__text">
                  <p className="record-banner__title">{report.title}</p>
                  {report.lines.map((line) => <p key={`${line.kind}:${line.id}`}>{line.name ? <><b>{line.name}</b> </> : null}{line.text}</p>)}
                  <div className="record-banner__actions">
                    {report.lines.some((l) => l.kind === 'kept') && (
                      <button type="button" className="voyage-bar__button" onClick={() => { const first = report.lines.find((l) => l.kind === 'kept'); setTab('in-use'); setBucket('all'); setQuery(first.name); setFocusId(first.id); }}><ArrowRight size={14} aria-hidden="true" /><span>Show it in In use</span></button>
                    )}
                    <button type="button" className="voyage-bar__button" onClick={() => setReport(null)}><span>Dismiss</span></button>
                  </div>
                </div>
              </div>
            )}
            {ready && view.refsFailed && (
              <div className="record-banner record-banner--bad" role="alert" data-testid="media-refs-failed">
                <span className="record-banner__icon" aria-hidden="true"><AlertTriangle size={18} /></span>
                <div className="record-banner__text">
                  <p className="record-banner__title">Nothing can be deleted right now</p>
                  <p>{joinNames(view.failedSections)} could not be checked. Until every section is checked, a file {view.failedSections.length === 1 ? 'it uses' : 'they use'} would look Not connected, so delete is off everywhere.</p>
                  <div className="record-banner__actions"><button type="button" className="voyage-bar__button" onClick={load} disabled={loading}><RefreshCw size={14} aria-hidden="true" /><span>{loading ? 'Checking' : 'Try again'}</span></button></div>
                </div>
              </div>
            )}
            {ready && view.failedBuckets.length > 0 && (
              <p className="media-warn" role="status">{joinNames(view.failedBuckets.map((b) => b.label))} could not be listed, so {view.failedBuckets.length === 1 ? 'its files are' : 'their files are'} missing here and no link into {view.failedBuckets.length === 1 ? 'it' : 'them'} is called broken.</p>
            )}
          </div>
        )}

        <div className="media-toolbar">
          <div className="media-tabs" role="tablist" aria-label="Files" onKeyDown={onTabKey}>
            {TABS.map((t) => (
              <button key={t.id} id={`${id}-tab-${t.id}`} type="button" role="tab" aria-selected={tab === t.id} aria-controls={`${id}-panel`} tabIndex={tab === t.id ? 0 : -1} className={`media-tab${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>
                <span>{t.label}</span>{ready && <span className={`media-tab__count${t.id === 'broken' && tabCount.broken ? ' is-bad' : ''}`}>{tabCount[t.id]}</span>}
              </button>
            ))}
          </div>
          <label className="media-search"><Search size={15} aria-hidden="true" /><input type="search" value={query} placeholder="Search files or entries" aria-label="Search files or entries" onChange={(e) => setQuery(e.target.value)} /></label>
          <div className="media-selects">
            <label className="media-select"><span>Bucket</span>
              <select value={bucket} onChange={(e) => setBucket(e.target.value)} aria-label="Bucket">
                <option value="all">All buckets</option>
                {bucketsShown.map((b) => <option key={b.id} value={b.id}>{b.label}{ready ? ` (${perBucket[b.id] || 0})` : ''}</option>)}
              </select>
            </label>
            {tab !== 'broken' && (
              <label className="media-select"><span>Sort</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
                  {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>

        <div className="media-dialog__body">
          <div className="media-list" id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`}>
            {!snapshot && loading && <p className="media-note" role="status">Reading {MEDIA_LIBRARY_BUCKETS.length} buckets and checking {REFERENCE_TABLES.length} sections</p>}
            {error && (
              <div className="record-banner record-banner--bad" role="alert">
                <span className="record-banner__icon" aria-hidden="true"><AlertTriangle size={18} /></span>
                <div className="record-banner__text"><p className="record-banner__title">{error}</p><div className="record-banner__actions"><button type="button" className="voyage-bar__button" onClick={load}><RefreshCw size={14} aria-hidden="true" /><span>Try again</span></button></div></div>
              </div>
            )}
            {ready && (
              <>
                <p className="media-note">
                  {tab === 'in-use' && <>Every file here is used by an entry. To delete one, <b>detach it from its entry first</b>.</>}
                  {tab === 'not-connected' && (deleteOff
                    ? <>This list may be wrong while {view.failedSections.length === 1 ? 'one section is' : `${view.failedSections.length} sections are`} unchecked. <b>Delete is off</b> until Try again succeeds.</>
                    : <>No entry points at these files, so they are <b>safe to delete</b>. Each one is checked again right before it is deleted.</>)}
                  {tab === 'broken' && <>These entries point at files that are <b>no longer in storage</b>. The public site shows a gap or a broken picture there. Open the entry to upload the file again or remove the link.</>}
                </p>

                {tab === 'in-use' && (shownFiles.length ? groups.map((group) => (
                  <section key={group.section} className="media-group" aria-label={group.section}>
                    <h4 className="media-group__head"><span>{group.section}</span><span>{group.files.length} {group.files.length === 1 ? 'file' : 'files'}</span></h4>
                    <ul className="media-rows">
                      {group.files.map((f) => <FileRow key={f.id} file={f} focused={wide && focused?.id === f.id} moved={moved.has(f.id)} onPick={pick} onDelete={askDelete} deleteOff={deleteOff} />)}
                    </ul>
                  </section>
                )) : <div className="media-empty"><h4>{view.inUse.length ? 'No match' : 'No file is in use yet'}</h4><p>{view.inUse.length ? 'No file in use matches these filters.' : 'Files show up here once an entry points at them.'}</p></div>)}

                {tab === 'not-connected' && (shownFiles.length ? (
                  <ul className="media-rows">
                    {visibleFiles.map((f) => <FileRow key={f.id} file={f} focused={wide && focused?.id === f.id} selectable selected={selected.has(f.id)} onToggle={toggle} onPick={pick} onDelete={askDelete} deleteOff={deleteOff} />)}
                  </ul>
                ) : <div className="media-empty"><h4>{view.notConnected.length ? 'No match' : 'Nothing to clean up'}</h4><p>{view.notConnected.length ? 'No file that is not connected matches these filters.' : 'Every file in storage is used by an entry. Files show up here when you replace a picture or remove an entry and the old file stays behind.'}</p></div>)}

                {tab === 'broken' && (shownBroken.length ? groupBroken(shownBroken).map((group) => (
                  <section key={group.section} className="media-group" aria-label={group.section}>
                    <h4 className="media-group__head"><span>{group.section}</span><span>{group.links.length} broken</span></h4>
                    <ul className="media-rows">{group.links.map((link) => <BrokenRow key={link.id} link={link} onOpenEntry={openEntry} onCopy={copy} />)}</ul>
                  </section>
                )) : <div className="media-empty"><h4>{view.broken.length ? 'No match' : 'No broken links'}</h4><p>{view.broken.length ? 'No broken link matches this search.' : 'Every entry points at a file that is in storage.'}</p></div>)}

                {tab !== 'broken' && shownFiles.length > limit && (
                  <div className="media-more">
                    <span>{limit} of {shownFiles.length}</span>
                    <button type="button" className="voyage-bar__button" onClick={() => setLimit((n) => n + PAGE_SIZE)}><span>Show {Math.min(PAGE_SIZE, shownFiles.length - limit)} more</span></button>
                  </div>
                )}
              </>
            )}
          </div>
          {wide && ready && tab !== 'broken' && (
            <aside className="media-pane" aria-label="Preview">
              <Preview file={focused} moved={focused ? moved.has(focused.id) : false} {...previewProps} />
            </aside>
          )}
        </div>

        {ready && tab === 'not-connected' && view.notConnected.length > 0 && (
          <footer className="record-dialog__foot media-dialog__foot">
            <label className="media-foot__all">
              <input type="checkbox" checked={allShownSelected} disabled={deleteOff || !visibleFiles.length} onChange={toggleAllShown} />
              <span>{selectedFiles.length ? <><b>{selectedFiles.length} selected</b> · {bytesLabel(totalBytes(selectedFiles))}</> : 'Select all shown'}</span>
            </label>
            <div className="media-foot__go">
              {deleteOff && <span className="media-foot__off">Delete is off</span>}
              <button type="button" className="voyage-bar__button voyage-bar__button--danger" disabled={deleteOff || !selectedFiles.length} onClick={(e) => openLayer({ kind: 'confirm', files: selectedFiles }, e.currentTarget)}>
                <Trash2 size={15} aria-hidden="true" /><span>{selectedFiles.length ? `Delete ${selectedFiles.length} ${selectedFiles.length === 1 ? 'file' : 'files'}` : 'Delete'}</span>
              </button>
            </div>
          </footer>
        )}

        {status && <p className="media-dialog__status" role="status" aria-live="polite">{status}</p>}

        {layer && (
          <div className={`media-layer${layer.kind === 'lightbox' ? ' media-layer--lightbox' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) closeLayer(); }}>
            {layer.kind === 'blocked' && (
              <div ref={layerRef} className="media-layer__panel" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-blocked`} aria-describedby={`${id}-blocked-body`}>
                <h4 id={`${id}-blocked`}>This file is in use</h4>
                <p id={`${id}-blocked-body`}>
                  {layer.file.entries.length === 1
                    ? <>This file is used by <b>{entryLabel(layer.file.entries[0])}</b>. Detach it there first, then come back to delete it.</>
                    : <>This file is used by {layer.file.entries.length} entries. Detach it from each of them first, then come back to delete it.</>}
                </p>
                <div className="media-layer__file"><Thumb file={layer.file} /><span><b>{layer.file.name}</b><span>{layer.file.bucketLabel} · {bytesLabel(layer.file.size)}</span></span></div>
                {layer.file.entries.length > 1 && (
                  <ul className="media-preview__entries">
                    {layer.file.entries.map((entry) => (
                      <li key={`${entry.table}:${entry.rowId}`}><button type="button" className="media-entry" onClick={() => openEntry(entry)} aria-label={`Open that entry: ${entryLabel(entry)}`}><span><span className="media-entry__section">{entry.section}</span><span className="media-entry__title">{entry.title}</span></span><ArrowRight size={15} aria-hidden="true" /></button></li>
                    ))}
                  </ul>
                )}
                <div className="media-layer__actions">
                  <button type="button" className="voyage-bar__button" onClick={closeLayer} data-autofocus={layer.file.entries.length > 1 ? true : undefined}><span>Close</span></button>
                  {layer.file.entries.length === 1 && <button type="button" className="voyage-bar__button voyage-bar__button--primary" data-autofocus onClick={() => openEntry(layer.file.entries[0])}><ArrowRight size={15} aria-hidden="true" /><span>Open that entry</span></button>}
                </div>
              </div>
            )}
            {layer.kind === 'confirm' && (
              <div ref={layerRef} className="media-layer__panel" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-confirm`} aria-describedby={`${id}-confirm-body`} aria-busy={busy}>
                <h4 id={`${id}-confirm`}>Delete {layer.files.length} {layer.files.length === 1 ? 'file' : 'files'}?</h4>
                <p id={`${id}-confirm-body`}>{layer.files.length === 1 ? 'It is' : 'They are'} removed from storage for good and {layer.files.length === 1 ? 'frees' : 'free'} {bytesLabel(totalBytes(layer.files))}. This cannot be undone.</p>
                <ul className="media-layer__list">
                  {layer.files.map((f) => <li key={f.id}><span>{f.name}</span><span>{bytesLabel(f.size)}</span></li>)}
                </ul>
                <p className="media-layer__more">Right before deleting, each file is checked again against every section. A file that turned out to be in use is kept and moves to In use.</p>
                <div className="media-layer__actions">
                  <button type="button" className="voyage-bar__button" onClick={closeLayer} disabled={busy} data-autofocus><span>Cancel</span></button>
                  <button type="button" className="voyage-bar__button voyage-bar__button--danger" onClick={() => confirmDelete(layer.files)} disabled={busy || deleteOff}><Trash2 size={15} aria-hidden="true" /><span>{busy ? 'Checking and deleting' : `Delete ${layer.files.length} ${layer.files.length === 1 ? 'file' : 'files'}`}</span></button>
                </div>
              </div>
            )}
            {layer.kind === 'lightbox' && (
              <div ref={layerRef} className="media-layer__panel media-layer__panel--lightbox" role="dialog" aria-modal="true" aria-label={lightboxFile ? lightboxFile.name : 'File'}>
                <div className="media-layer__bar">
                  <h4>{lightboxFile ? lightboxFile.name : 'File'}</h4>
                  <button type="button" className="record-dialog__close" onClick={closeLayer} aria-label="Close preview" data-autofocus><X size={18} /></button>
                </div>
                <div className="media-layer__scroll">
                  <Preview file={lightboxFile} moved={lightboxFile ? moved.has(lightboxFile.id) : false} {...previewProps} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
