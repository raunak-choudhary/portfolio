// src/components/admin/Voyage/MediaChapter.js
//
// The media library: every file in the portfolio's storage buckets as a
// plate in a deck, with its bucket, size, date and whether a record points
// at it. Read-only on purpose. "Unknown" is a hint, not proof a file is
// unused (a file can be linked from somewhere this check does not read),
// so the chapter offers no delete; cleanup stays a deliberate, manual act.
//
// Thumbnails load lazily and fall back to a typographic mark (PDF, PNG...)
// when there is no picture or it fails. Private files open through a fresh
// five-minute signed link when the one made at load has lapsed.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Lock, RefreshCw, Search } from 'lucide-react';
import { PAGE_SIZE, STATUS_FILTERS, bucketCounts, bytesLabel, cleanItems, fileMark, hasThumbnail, statusStamp, summarize, visibleItems } from './mediaModel';
import { formatStamp } from './inboxModel';
import { MEDIA_LIBRARY_BUCKETS, createMediaSignedUrl, getMediaLibrarySnapshot } from '../../../services/mediaLibraryService';
import './Inbox.css';   // filter pills, search and stamps are shared with the inbox
import './Media.css';

const SIGNED_SECONDS = 300;
const LINK_MARGIN_MS = 60 * 1000;

function Plate({ item, loadedAt, notify }) {
  const [broken, setBroken] = useState(false);
  const [busy, setBusy] = useState(false);
  const thumb = hasThumbnail(item) && !broken;
  const stampInfo = statusStamp(item);

  // a public link never expires; a private one made at load does
  const open = async (e) => {
    if (!item.isPrivate) return;
    if (item.previewUrl && Date.now() - loadedAt < SIGNED_SECONDS * 1000 - LINK_MARGIN_MS) return;
    e.preventDefault();
    setBusy(true);
    try { window.open(await createMediaSignedUrl(item.bucketId, item.path, SIGNED_SECONDS), '_blank', 'noopener,noreferrer'); } catch { notify('A link to this private file could not be made. Try again.', 'bad'); } finally { setBusy(false); }
  };

  return (
    <li className="plate voyage-pane" data-status={item.status}>
      <div className={`plate__face${thumb ? '' : ' is-mark'}`}>
        {thumb
          ? <img src={item.previewUrl} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
          : <span className="plate__mark" aria-hidden="true">{fileMark(item)}</span>}
      </div>
      <div className="plate__body">
        <p className="plate__name">{item.name}</p>
        <p className="plate__meta">{item.bucketLabel}{item.sizeLabel ? ` · ${item.sizeLabel}` : ''}</p>
        {item.updatedAt && <p className="plate__meta">{formatStamp(item.updatedAt)}</p>}
        <div className="plate__foot">
          <span className="stamps">
            <span className={`stamp stamp--${stampInfo.tone}`}>{stampInfo.label}</span>
            {item.isPrivate && <span className="stamp stamp--warn"><Lock size={10} aria-hidden="true" /> Private</span>}
          </span>
          {item.previewUrl || item.isPrivate
            ? <a className="voyage-bar__button voyage-bar__button--small" href={item.previewUrl || '#'} target="_blank" rel="noopener noreferrer" onClick={open} aria-label={`Open ${item.name} in a new tab`} aria-busy={busy}><ExternalLink size={13} /><span>{busy ? 'Opening' : 'Open'}</span></a>
            : null}
        </div>
      </div>
    </li>
  );
}

/**
 * @param {object} props
 * @param {(text: string, tone?: string) => void} props.notify
 */
export default function MediaChapter({ notify }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bucket, setBucket] = useState('all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const alive = useRef(true);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    getMediaLibrarySnapshot()
      .then((snap) => { if (alive.current) { setSnapshot(snap); setLoadedAt(Date.now()); setLoading(false); } })
      .catch(() => { if (alive.current) { setError('The media library could not be read.'); setLoading(false); } });
  }, []);
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, [load]);

  // a new filter starts from the first page
  useEffect(() => { setLimit(PAGE_SIZE); }, [bucket, status, query]);

  const items = useMemo(() => cleanItems(snapshot?.items), [snapshot]);
  const shown = useMemo(() => visibleItems(items, { bucket, status, query }), [items, bucket, status, query]);
  const totals = useMemo(() => summarize(items), [items]);
  const perBucket = useMemo(() => bucketCounts(items), [items]);
  const failed = (snapshot?.buckets || []).filter((b) => b.status === 'error');
  const bucketsShown = (snapshot?.buckets?.length ? snapshot.buckets : MEDIA_LIBRARY_BUCKETS);

  return (
    <div className="media" data-testid="media">
      {!loading && !error && (
        <dl className="media__summary">
          <div><dt>Files</dt><dd>{totals.total}</dd></div>
          <div><dt>Referenced</dt><dd>{totals.referenced}</dd></div>
          <div><dt>Unknown</dt><dd>{totals.unknown}</dd></div>
          <div><dt>Private</dt><dd>{totals.private}</dd></div>
          <div><dt>Stored</dt><dd>{bytesLabel(totals.bytes)}</dd></div>
        </dl>
      )}

      <div className="media__bar">
        <div className="inbox__filters" role="group" aria-label="Status">
          {STATUS_FILTERS.map((f) => (
            <button key={f.id} type="button" className={`inbox__filter${status === f.id ? ' is-on' : ''}`} aria-pressed={status === f.id} onClick={() => setStatus(f.id)}>
              <span>{f.label}</span><span className="inbox__filter-count">{loading ? '' : f.id === 'all' ? totals.total : totals[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="inbox__tools">
          <label className="inbox__sort media__bucket"><span>Bucket</span>
            <select value={bucket} onChange={(e) => setBucket(e.target.value)} aria-label="Bucket">
              <option value="all">All buckets</option>
              {bucketsShown.map((b) => <option key={b.id} value={b.id}>{b.label} ({perBucket[b.id] || 0})</option>)}
            </select>
          </label>
          <label className="deck__search inbox__search"><Search size={14} aria-hidden="true" /><input type="search" value={query} placeholder="Search files" onChange={(e) => setQuery(e.target.value)} aria-label="Search files" /></label>
        </div>
      </div>

      <p className="media__note">Unknown means no record this check reads points at the file. It is not proof the file is unused, so nothing here deletes.</p>

      {error && (
        <div className="deck__error" role="alert">
          <span>{error}</span>
          <button type="button" className="voyage-bar__button" onClick={load}><RefreshCw size={14} /><span>Try again</span></button>
        </div>
      )}
      {failed.length > 0 && (
        <p className="media__warn" role="status">{failed.map((b) => b.label).join(', ')} could not be listed, so {failed.length === 1 ? 'its files are' : 'their files are'} missing here.</p>
      )}

      {loading && <p className="deck__empty" role="status">Reading the buckets</p>}
      {!loading && !error && !shown.length && <p className="deck__empty">{items.length ? 'No file matches these filters.' : 'No files in storage yet.'}</p>}
      {shown.length > 0 && (
        <ul className="media__grid">
          {shown.slice(0, limit).map((item) => <Plate key={item.id} item={item} loadedAt={loadedAt} notify={notify} />)}
        </ul>
      )}
      {shown.length > limit && (
        <div className="media__more">
          <span className="deck__count">{limit} of {shown.length}</span>
          <button type="button" className="voyage-bar__button" onClick={() => setLimit((n) => n + PAGE_SIZE)}><span>Show {Math.min(PAGE_SIZE, shown.length - limit)} more</span></button>
        </div>
      )}
    </div>
  );
}
