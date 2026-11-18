// src/components/admin/Voyage/InboxDialog.js
//
// One telegram opened in full: sender, the whole message, its enclosures,
// the owner's notes and every action. It reuses the record dialog's glass
// surface, banner copy and focus handling, so the inbox reads as part of the
// same admin rather than a second app.
//
// The dialog owns no message state. It renders the row the chapter hands it
// (so an optimistic change shows at once and a rollback shows too) and
// reports actions upward; the chapter performs them and returns the error,
// if any, which becomes a banner here.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Archive, ArchiveRestore, ExternalLink, LogIn, Mail, MailOpen, Paperclip, RefreshCw, Reply, ShieldAlert, ShieldCheck, Star, StarOff, Trash2, WifiOff, X } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { failureCopy } from './RecordDialog';
import { PRIORITIES, attachmentsOf, formatStamp, inquiryLabel, isUnread, priorityOf, replyAddress, replyHref, roleLabel, stampsFor, telegramNumber } from './inboxModel';
import { failureKind, sizeLabel } from '../../../services/voyageRecords';
import { SIGNED_URL_SECONDS, signedAttachmentUrl } from '../../../services/inboxService';

const FOCUSABLE = 'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])';
// a signed link is re-made when it is this close to expiring, so a click never opens a dead link
const LINK_MARGIN_MS = 60 * 1000;

/** The row of stamps a telegram carries. Shared with the list. */
export function Stamps({ message }) {
  const stamps = stampsFor(message);
  if (!stamps.length) return null;
  return <span className="stamps">{stamps.map((s) => <span key={s.id} className={`stamp stamp--${s.tone}`}>{s.label}</span>)}</span>;
}

function Fact({ label, children }) {
  if (children === null || children === undefined || children === '') return null;
  return <div className="inbox-facts__row"><dt>{label}</dt><dd>{children}</dd></div>;
}

/**
 * Signed links for a message's enclosures, made once per opening. Each link
 * lives five minutes; a click on one near its end makes a fresh link first.
 */
function useSignedLinks(message, open) {
  const [links, setLinks] = useState({});        // path -> { url, at } | { error: true } | { busy: true }
  const key = open && message ? message.id : null;
  useEffect(() => {
    if (!key) { setLinks({}); return undefined; }
    let alive = true;
    const files = attachmentsOf(message);
    setLinks(Object.fromEntries(files.map((f) => [f.path, { busy: true }])));
    files.forEach((f) => {
      signedAttachmentUrl(f.path)
        .then((url) => alive && setLinks((l) => ({ ...l, [f.path]: { url, at: Date.now() } })))
        .catch(() => alive && setLinks((l) => ({ ...l, [f.path]: { error: true } })));
    });
    return () => { alive = false; };
    // only a different message (or a reopening) re-signs; row edits do not
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const resign = async (path) => {
    setLinks((l) => ({ ...l, [path]: { busy: true } }));
    try { const url = await signedAttachmentUrl(path); setLinks((l) => ({ ...l, [path]: { url, at: Date.now() } })); return url; } catch { setLinks((l) => ({ ...l, [path]: { error: true } })); return null; }
  };
  return { links, resign };
}

/**
 * @param {object} props
 * @param {object|null} props.message the current row (null closes the dialog).
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(action: string, value?: string) => Promise<Error|null>} props.onAction runs a patch action on this message.
 * @param {() => Promise<Error|null>} props.onDelete deletes this message and its files.
 * @param {{error: Error, action: string}|null} props.failure the last failure that came from this dialog.
 * @param {() => void} props.onDismissFailure
 * @param {boolean} props.online
 */
export default function InboxDialog({ message, open, onClose, onAction, onDelete, failure, onDismissFailure, online = true }) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const panelRef = useRef(null), openerRef = useRef(null);
  const id = message?.id;

  // notes start from the saved text whenever another message opens
  useEffect(() => { if (open) { setNotes(message?.admin_notes || ''); setConfirming(false); } }, [open, id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const { links, resign } = useSignedLinks(message, open);

  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); if (confirming) setConfirming(false); else if (!busy) onClose(); return; }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const nodes = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((n) => !n.disabled);
    if (!nodes.length) return;
    const [head, tail] = [nodes[0], nodes[nodes.length - 1]];
    if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus(); } else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
  };

  // scroll lock, Escape, focus trap and focus return, once per opening (same pattern as RecordDialog)
  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => keyRef.current(e);
    document.addEventListener('keydown', onKey, true);
    panelRef.current?.querySelector('.record-dialog__close')?.focus();
    return () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = previousOverflow; openerRef.current?.focus?.(); };
  }, [open]);

  if (!open || !message) return null;

  const act = async (action, value) => { setBusy(true); try { await onAction(action, value); } finally { setBusy(false); } };
  const remove = async () => { setConfirming(false); setBusy(true); try { await onDelete(); } finally { setBusy(false); } };

  const openLink = async (e, file) => {
    const link = links[file.path];
    if (link?.url && Date.now() - link.at < SIGNED_URL_SECONDS * 1000 - LINK_MARGIN_MS) return;   // the anchor opens it
    e.preventDefault();
    const url = await resign(file.path);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const files = attachmentsOf(message);
  const savedNotes = message.admin_notes || '';
  const notesDirty = notes.trim() !== savedNotes.trim();
  const reply = replyHref(message);
  const unread = isUnread(message);
  const copy = failure ? failureCopy(failureKind(failure.error), failure.action === 'delete' ? 'delete' : 'save', failure.error?.message) : null;
  const paragraphs = String(message.message || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const disabled = busy || !online;

  return createPortal(
    <div className="record-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={panelRef} className="record-dialog inbox-dialog" role="dialog" aria-modal="true" aria-labelledby="inbox-dialog-title" data-testid="inbox-dialog">
        <header className="record-dialog__head">
          <div className="record-dialog__titles">
            <div className="voyage-chapter__kicker">Telegram {telegramNumber(message)}</div>
            <h3 id="inbox-dialog-title">{message.subject?.trim() || 'No subject'}</h3>
            <Stamps message={message} />
          </div>
          <button type="button" className="record-dialog__close" onClick={onClose} aria-label="Close" disabled={busy}><X size={18} /></button>
        </header>

        <div className="record-dialog__banners">
          {!online && (
            <div className="record-banner record-banner--warn" role="status">
              <WifiOff size={16} aria-hidden="true" className="record-banner__icon" />
              <div className="record-banner__text"><p className="record-banner__title">You are offline.</p><p>Changes wait until the connection comes back.</p></div>
            </div>
          )}
          {copy && (
            <div className="record-banner record-banner--bad" role="alert">
              {failureKind(failure.error) === 'session' ? <LogIn size={16} aria-hidden="true" className="record-banner__icon" /> : <AlertCircle size={16} aria-hidden="true" className="record-banner__icon" />}
              <div className="record-banner__text">
                <p className="record-banner__title">{copy.title}</p>
                <p>{copy.body}</p>
                <div className="record-banner__actions">
                  {copy.link && <a className="voyage-bar__button" href={copy.link.href} target="_blank" rel="noopener noreferrer"><span>{copy.link.label}</span></a>}
                  <button type="button" className="voyage-bar__button voyage-bar__button--plain" onClick={onDismissFailure}><span>Dismiss</span></button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="record-dialog__body inbox-dialog__body">
          <section className="inbox-dialog__section" aria-labelledby="inbox-from">
            <h4 className="record-view__heading" id="inbox-from">From</h4>
            <dl className="inbox-facts">
              <Fact label="Name">{message.name}</Fact>
              <Fact label="Email">{replyAddress(message.email) ? <a className="record-view__link" href={`mailto:${replyAddress(message.email)}`}>{message.email}</a> : message.email}</Fact>
              <Fact label="Organization">{message.organization}</Fact>
              <Fact label="Role">{message.role ? roleLabel(message.role) : null}</Fact>
              <Fact label="Inquiry">{message.inquiry_type ? inquiryLabel(message.inquiry_type) : null}</Fact>
              <Fact label="Received">{formatStamp(message.created_at)}</Fact>
              <Fact label="Read">{message.read_at ? formatStamp(message.read_at) : 'Not yet'}</Fact>
            </dl>
          </section>

          <section className="inbox-dialog__section" aria-labelledby="inbox-text">
            <h4 className="record-view__heading" id="inbox-text">Message</h4>
            <div className="inbox-dialog__text">{paragraphs.length ? paragraphs.map((p, i) => <p key={i}>{p}</p>) : <p className="inbox-dialog__none">The message is empty.</p>}</div>
          </section>

          {files.length > 0 && (
            <section className="inbox-dialog__section" aria-labelledby="inbox-files">
              <h4 className="record-view__heading" id="inbox-files">{files.length === 1 ? 'Enclosure' : `Enclosures (${files.length})`}</h4>
              <ul className="enclosures">
                {files.map((f) => {
                  const link = links[f.path] || {};
                  return (
                    <li key={f.key} className="enclosure">
                      <Paperclip size={15} aria-hidden="true" className="enclosure__icon" />
                      <span className="enclosure__name">{f.name}{f.size ? <span className="enclosure__size"> · {sizeLabel(f.size)}</span> : null}</span>
                      {link.error
                        ? <button type="button" className="voyage-bar__button voyage-bar__button--small" onClick={() => resign(f.path)}><RefreshCw size={13} /><span>Link failed, try again</span></button>
                        : link.url
                          ? <a className="voyage-bar__button voyage-bar__button--small" href={link.url} target="_blank" rel="noopener noreferrer" onClick={(e) => openLink(e, f)} aria-label={`Open ${f.name} in a new tab`}><ExternalLink size={13} /><span>Open</span></a>
                          : <span className="enclosure__busy" role="status">Preparing link</span>}
                    </li>
                  );
                })}
              </ul>
              <p className="inbox-dialog__hint">Links are private and last five minutes.</p>
            </section>
          )}

          <section className="inbox-dialog__section inbox-dialog__desk" aria-label="Notes and priority">
            <div className="field inbox-dialog__notes">
              <label htmlFor="inbox-notes">Notes</label>
              <textarea id="inbox-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only you see these." />
              <div className="inbox-dialog__notes-bar">
                <span className="inbox-dialog__hint" aria-live="polite">{notesDirty ? 'Unsaved notes' : savedNotes ? 'Saved' : ''}</span>
                <button type="button" className="voyage-bar__button voyage-bar__button--small" onClick={() => act('notes', notes)} disabled={disabled || !notesDirty}><span>Save notes</span></button>
              </div>
            </div>
            <div className="field inbox-dialog__priority">
              <label htmlFor="inbox-priority">Priority</label>
              <select id="inbox-priority" value={priorityOf(message)} onChange={(e) => act('priority', e.target.value)} disabled={disabled}>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </section>
        </div>

        <footer className="record-dialog__foot inbox-dialog__foot">
          <button type="button" className="voyage-bar__button voyage-bar__button--quiet" onClick={() => setConfirming(true)} disabled={disabled}><Trash2 size={15} /><span>Delete</span></button>
          <div className="record-dialog__actions inbox-dialog__actions">
            <button type="button" className="voyage-bar__button voyage-bar__button--plain" onClick={() => act(unread ? 'read' : 'unread')} disabled={disabled}>{unread ? <MailOpen size={14} /> : <Mail size={14} />}<span>{unread ? 'Mark read' : 'Mark unread'}</span></button>
            <button type="button" className="voyage-bar__button voyage-bar__button--plain" onClick={() => act(message.is_starred ? 'unstar' : 'star')} disabled={disabled} aria-pressed={Boolean(message.is_starred)}>{message.is_starred ? <StarOff size={14} /> : <Star size={14} />}<span>{message.is_starred ? 'Unstar' : 'Star'}</span></button>
            <button type="button" className="voyage-bar__button voyage-bar__button--plain" onClick={() => act(message.is_archived ? 'unarchive' : 'archive')} disabled={disabled}>{message.is_archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}<span>{message.is_archived ? 'Unarchive' : 'Archive'}</span></button>
            <button type="button" className="voyage-bar__button voyage-bar__button--plain" onClick={() => act(message.is_spam ? 'notSpam' : 'spam')} disabled={disabled}>{message.is_spam ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}<span>{message.is_spam ? 'Not spam' : 'Spam'}</span></button>
            {reply && <a className="voyage-bar__button voyage-bar__button--primary" href={reply}><Reply size={14} /><span>Reply</span></a>}
          </div>
        </footer>
        <ConfirmDialog
          open={confirming}
          title="Delete this message?"
          body={files.length ? `The message and its ${files.length === 1 ? 'enclosure' : `${files.length} enclosures`} are removed for good.` : 'The message is removed for good.'}
          confirmLabel="Delete"
          tone="danger"
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
      </div>
    </div>,
    document.body,
  );
}
