// src/components/admin/Voyage/InboxChapter.js
//
// The inbox as a telegraph office: every contact message is a telegram on
// a strip of tape, filed under a number, marked with stamps (unread, spam,
// priority, starred, archived) and opened in full in a dialog. No pictures
// and no emoji: the look is type, rules and stamps.
//
// Every change is optimistic. The list shows the result at once; if the
// server refuses, the touched columns are put back as they were and the
// reason is shown (a toast for list actions, a banner inside the dialog for
// dialog actions). Only the columns a patch wrote are restored, so a
// rollback never undoes a different change that succeeded meanwhile.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArchiveRestore, Mail, MailOpen, Paperclip, RefreshCw, Search, ShieldAlert, ShieldCheck, Star, StarOff, Trash2, X } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import InboxDialog, { Stamps } from './InboxDialog';
import useOnline from './useOnline';
import {
  ACTIONS, FILTERS, SORTS, attachmentsOf, bulkActionsFor, countMessages, formatStamp, isUnread, messagesWord, patchFor,
  preview, pruneSelection, selectionState, telegramNumber, toggleAll, toggleId, visibleMessages,
} from './inboxModel';
import { failureKind } from '../../../services/voyageRecords';
import { deleteMessages, listMessages, updateMessages } from '../../../services/inboxService';
import { noteContentChanged } from './contentChanged';
import './Inbox.css';

const ACTION_ICON = { read: MailOpen, unread: Mail, star: Star, unstar: StarOff, archive: Archive, unarchive: ArchiveRestore, spam: ShieldAlert, notSpam: ShieldCheck };

/** One sentence for a failed change, short enough for a toast. */
export function toastFor(err, verb = 'change') {
  switch (failureKind(err)) {
    case 'session': return 'Your session has expired. Sign in again in a new tab, then try again.';
    case 'permission': return `The ${verb} was refused. Enter your authenticator code in a new tab, then try again.`;
    case 'network': return `The ${verb} did not reach the server. Check the connection and try again.`;
    default: return err?.message || `The ${verb} did not go through.`;
  }
}

const LOAD_FAILURE = {
  session: 'Your session has expired. Sign in again in a new tab, then try again.',
  permission: 'The inbox could not be read. Enter your authenticator code in a new tab, then try again.',
  network: 'The inbox did not load. Check the connection and try again.',
  unknown: 'The inbox could not be loaded.',
};

/** Puts back, for the given ids, only the columns a patch wrote. */
function restore(messages, before, ids, patch) {
  const keys = Object.keys(patch);
  const set = new Set(ids);
  return messages.map((m) => {
    if (!set.has(m.id) || !before.has(m.id)) return m;
    const old = before.get(m.id);
    return { ...m, ...Object.fromEntries(keys.map((k) => [k, old[k]])) };
  });
}

function Telegram({ message, selected, onToggle, onOpen }) {
  const files = attachmentsOf(message).length;
  const from = message.name?.trim() || 'Unknown sender';
  return (
    <li className={`telegram voyage-pane${isUnread(message) ? ' is-unread' : ''}${selected ? ' is-selected' : ''}`} data-id={message.id}>
      <label className="telegram__pick">
        <input type="checkbox" checked={selected} onChange={() => onToggle(message.id)} aria-label={`Select the message from ${from}`} />
      </label>
      <button type="button" className="telegram__open" onClick={() => onOpen(message)} aria-label={`Open the message from ${from}${isUnread(message) ? ', unread' : ''}`}>
        <span className="telegram__tape">
          <span className="telegram__no">{telegramNumber(message)}</span>
          <time dateTime={message.created_at}>{formatStamp(message.created_at)}</time>
        </span>
        <span className="telegram__from"><b>{from}</b>{message.email ? <span className="telegram__email">{message.email}</span> : null}</span>
        <span className="telegram__subject">{message.subject?.trim() || 'No subject'}</span>
        {message.message ? <span className="telegram__preview">{preview(message.message)}</span> : null}
        <span className="telegram__marks">
          <Stamps message={message} />
          {files > 0 && <span className="telegram__files"><Paperclip size={12} aria-hidden="true" />{files === 1 ? '1 enclosure' : `${files} enclosures`}</span>}
        </span>
      </button>
    </li>
  );
}

/**
 * @param {object} props
 * @param {(text: string, tone?: string) => void} props.notify
 */
export default function InboxChapter({ notify }) {
  const online = useOnline();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('date');
  const [selected, setSelected] = useState(() => new Set());
  const [openId, setOpenId] = useState(null);
  const [dialogFailure, setDialogFailure] = useState(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [working, setWorking] = useState(false);
  const alive = useRef(true);
  const listRef = useRef(messages);
  listRef.current = messages;
  const allRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    listMessages()
      .then((rows) => { if (alive.current) { setMessages(rows); setLoading(false); } })
      .catch((err) => { if (alive.current) { setError(LOAD_FAILURE[failureKind(err)] || LOAD_FAILURE.unknown); setLoading(false); } });
  }, []);

  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, [load]);

  const shown = useMemo(() => visibleMessages(messages, { filter, query, sort }), [messages, filter, query, sort]);
  const shownIds = useMemo(() => shown.map((m) => m.id), [shown]);
  const counts = useMemo(() => countMessages(messages), [messages]);
  const pick = selectionState(selected, shownIds);
  const chosen = useMemo(() => shown.filter((m) => selected.has(m.id)), [shown, selected]);
  const open = openId ? messages.find((m) => m.id === openId) || null : null;

  // a new filter or search starts a new selection; a change that moves
  // messages out of view (read under Unread, spam under All) drops them
  useEffect(() => { setSelected(new Set()); }, [filter, query]);
  useEffect(() => { setSelected((s) => pruneSelection(s, shownIds)); }, [shownIds]);
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = pick.some; }, [pick.some]);

  /**
   * Applies a patch optimistically and writes it. Resolves to the error (or
   * null) so the dialog can show it as a banner.
   */
  const run = useCallback(async (ids, patch, { done, origin = 'list' } = {}) => {
    const before = new Map(listRef.current.filter((m) => ids.includes(m.id)).map((m) => [m.id, m]));
    setMessages((list) => list.map((m) => (ids.includes(m.id) ? { ...m, ...patch } : m)));
    if (origin === 'dialog') setDialogFailure(null);
    try {
      const rows = await updateMessages(ids, patch);
      // one raise per write, however many messages it covered, so the activity pane picks the change up
      noteContentChanged();
      if (alive.current) setMessages((list) => list.map((m) => { const r = rows.find((x) => x.id === m.id); return r ? { ...m, ...r } : m; }));
      if (done) notify(done);
      return null;
    } catch (err) {
      if (alive.current) setMessages((list) => restore(list, before, ids, patch));
      if (origin === 'dialog') setDialogFailure({ error: err, action: 'save' });
      else notify(toastFor(err), 'bad');
      return err;
    }
  }, [notify]);

  const openMessage = useCallback((m) => {
    setDialogFailure(null);
    setOpenId(m.id);
    // opening a telegram reads it; a refusal puts the stamp back and says why
    if (isUnread(m)) run([m.id], patchFor('read'), { origin: 'dialog' });
  }, [run]);

  const dialogAction = useCallback((action, value) => {
    if (!open) return Promise.resolve(null);
    const patch = patchFor(action, { value });
    const done = action === 'notes' ? 'Notes saved.' : action === 'priority' ? 'Priority saved.' : `Message ${ACTIONS[action].done}.`;
    return run([open.id], patch, { done, origin: 'dialog' });
  }, [open, run]);

  const bulk = useCallback((action) => {
    const ids = chosen.map((m) => m.id);
    if (!ids.length) return;
    run(ids, patchFor(action), { done: `${messagesWord(ids.length)} ${ACTIONS[action].done}.` });
  }, [chosen, run]);

  /** Deletes rows and their files; on a half-finished delete, reloads so the list shows the truth. */
  const remove = useCallback(async (rows, origin) => {
    setWorking(true);
    if (origin === 'dialog') setDialogFailure(null);
    try {
      const { deletedIds, filesRemoved, filesExpected } = await deleteMessages(rows);
      noteContentChanged();
      if (!alive.current) return null;
      const gone = new Set(deletedIds);
      setMessages((list) => list.filter((m) => !gone.has(m.id)));
      setSelected((s) => new Set([...s].filter((id) => !gone.has(id))));
      if (gone.has(openId)) setOpenId(null);
      const lead = `${messagesWord(deletedIds.length)} deleted`;
      if (filesRemoved < filesExpected) notify(`${lead}. ${filesExpected - filesRemoved} of ${filesExpected} enclosures were already missing from storage.`, 'warn');
      else notify(filesExpected ? `${lead} with ${filesExpected === 1 ? 'its enclosure' : `${filesExpected} enclosures`}.` : `${lead}.`);
      return null;
    } catch (err) {
      if (!alive.current) return err;
      if (err.filesRemoved) load();
      if (origin === 'dialog') setDialogFailure({ error: err, action: 'delete' });
      else notify(err.filesRemoved ? err.message : toastFor(err, 'delete'), 'bad');
      return err;
    } finally { if (alive.current) setWorking(false); }
  }, [load, notify, openId]);

  const actions = bulkActionsFor(chosen);
  const emptyText = !messages.length
    ? 'No messages yet. The contact form files them here.'
    : query.trim() ? `Nothing matches "${query.trim()}".` : `Nothing under ${FILTERS.find((f) => f.id === filter).label}.`;

  return (
    <div className="inbox" data-testid="inbox">
      <div className="inbox__bar">
        <div className="inbox__filters" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`inbox__filter${filter === f.id ? ' is-on' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              <span>{f.label}</span><span className="inbox__filter-count">{loading ? '' : counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="inbox__tools">
          <label className="deck__search inbox__search"><Search size={14} aria-hidden="true" /><input type="search" value={query} placeholder="Search messages" onChange={(e) => setQuery(e.target.value)} aria-label="Search messages" /></label>
          <label className="inbox__sort"><span>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort messages">{SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          </label>
        </div>
      </div>

      {error && (
        <div className="deck__error" role="alert">
          <span>{error}</span>
          <button type="button" className="voyage-bar__button" onClick={load}><RefreshCw size={14} /><span>Try again</span></button>
        </div>
      )}

      {chosen.length > 0 && (
        <div className="inbox__selection" role="region" aria-label="Selected messages">
          <span className="inbox__selection-count" aria-live="polite">{chosen.length} selected</span>
          <div className="inbox__selection-actions">
            {actions.map((a) => { const Icon = ACTION_ICON[a]; return <button key={a} type="button" className="voyage-bar__button voyage-bar__button--small" onClick={() => bulk(a)} disabled={working || !online}><Icon size={13} /><span>{ACTIONS[a].label}</span></button>; })}
            <button type="button" className="voyage-bar__button voyage-bar__button--small voyage-bar__button--danger" onClick={() => setConfirmBulk(true)} disabled={working || !online}><Trash2 size={13} /><span>Delete</span></button>
            <button type="button" className="voyage-bar__button voyage-bar__button--small voyage-bar__button--plain" onClick={() => setSelected(new Set())}><X size={13} /><span>Clear</span></button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="inbox__head">
          {shown.length > 0 && (
            <label className="inbox__all">
              <input ref={allRef} type="checkbox" checked={pick.all} onChange={() => setSelected((s) => toggleAll(s, shownIds))} aria-label="Select every message shown" />
              <span>Select all</span>
            </label>
          )}
          <span className="deck__count">{messagesWord(shown.length)}{filter !== 'all' || query.trim() ? ` of ${messagesWord(messages.length)}` : ''}</span>
        </div>
      )}

      {loading && <p className="deck__empty" role="status">Loading the inbox</p>}
      {!loading && !error && !shown.length && <p className="deck__empty">{emptyText}</p>}
      {shown.length > 0 && (
        <ol className="inbox__list">
          {shown.map((m) => <Telegram key={m.id} message={m} selected={selected.has(m.id)} onToggle={(id) => setSelected((s) => toggleId(s, id))} onOpen={openMessage} />)}
        </ol>
      )}

      <InboxDialog
        message={open}
        open={Boolean(open)}
        online={online}
        onClose={() => { setOpenId(null); setDialogFailure(null); }}
        onAction={dialogAction}
        onDelete={() => remove([open], 'dialog')}
        failure={dialogFailure}
        onDismissFailure={() => setDialogFailure(null)}
      />
      <ConfirmDialog
        open={confirmBulk}
        title={`Delete ${messagesWord(chosen.length)}?`}
        body={(() => { const n = chosen.reduce((sum, m) => sum + attachmentsOf(m).length, 0); return n ? `They are removed for good, with ${n === 1 ? 'their enclosure' : `their ${n} enclosures`}.` : 'They are removed for good.'; })()}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => { setConfirmBulk(false); remove(chosen, 'list'); }}
        onCancel={() => setConfirmBulk(false)}
      />
    </div>
  );
}
