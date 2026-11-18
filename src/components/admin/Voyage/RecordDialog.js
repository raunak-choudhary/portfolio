// src/components/admin/Voyage/RecordDialog.js
//
// The record dialog every manager shares: a wide centred glass dialog built
// from the manager's schema. Opening a saved record shows it rendered (the
// read view); Edit swaps in the form; Save writes and returns to the read
// view; Cancel returns too, after a discard check if anything changed. A new
// record opens straight in the form. Delete lives in the read view, behind a
// confirmation.
//
// Error handling is layered, from the field outwards, and nothing typed is
// ever thrown away by a failure:
//   1. a field's error shows once the field has been left, never on the
//      first keystroke, and every error shows after a Save attempt, with the
//      first invalid field focused and a count in the footer;
//   2. a failed request lands in a banner inside the dialog, sorted into a
//      kind (session expired, permission, network, unknown) with one fixed
//      sentence and the way out;
//   3. offline is detected before Save is pressed, and Save waits for the
//      connection;
//   4. before an update the row's updated_at is compared with the one this
//      dialog loaded, so a change made elsewhere is never overwritten blindly
//      (tables without updated_at skip the check);
//   5. image problems are reported per file next to the image field, and a
//      failed upload leaves the form exactly as it was.
//
// Image uploads and removals persist at once (a file in storage and a row
// that does not list it must never drift apart), so images can be added only
// after the first save.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, LogIn, Pencil, RefreshCw, Trash2, WifiOff, X } from 'lucide-react';
import Field from './Field';
import ConfirmDialog from './ConfirmDialog';
import RecordView, { WIDE_KINDS } from './RecordView';
import useOnline from './useOnline';
import { buildForm, fieldsForGroup, isDirty, normalizeForm, validateForm } from './managers/schemaModel';
import { deleteRecord, failureKind, fetchUpdatedAt, getRecord, imageProblems, removeImage, saveRecord, uploadImages } from '../../../services/voyageRecords';

const FOCUSABLE = 'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])';
const SIGN_IN_PATH = '/adminlogin';
const ADMIN_PATH = '/admindashboard';

/** Two timestamps name the same moment (Postgres and JS print them differently). */
export const sameStamp = (a, b) => (a == null || b == null ? a == null && b == null : Date.parse(a) === Date.parse(b));

/** "1 field needs attention" / "3 fields need attention". */
export const attentionText = (n) => `${n} ${n === 1 ? 'field needs' : 'fields need'} attention`;

/**
 * The banner copy for a failed request: a fixed headline per kind, what to do
 * next, and the server's own words only when the kind is unknown.
 */
export function failureCopy(kind, action, message) {
  const verb = action === 'delete' ? 'delete' : action === 'reload' ? 'reload' : 'save';
  switch (kind) {
    case 'session':
      return { title: 'Your session has expired.', body: `Sign in again in a new tab, then come back here and ${verb}. Everything typed here stays in this dialog.`, link: { href: SIGN_IN_PATH, label: 'Sign in in a new tab' } };
    case 'permission':
      return { title: `This ${verb} was refused.`, body: `The session is not allowed to make this change. If the authenticator code has not been entered yet, open the admin area in a new tab, enter it, then ${verb} again.`, link: { href: ADMIN_PATH, label: 'Open the admin area in a new tab' } };
    case 'network':
      return { title: `The ${verb} did not reach the server.`, body: `Check the connection, then try again. Nothing typed here is lost.`, retry: true };
    default:
      return { title: `The ${verb} did not go through.`, body: message ? `The server said: ${message}` : 'No reason was given.', retry: true };
  }
}

function Banner({ tone, icon: Icon, title, children, id, live = 'alert' }) {
  return (
    <div id={id} className={`record-banner record-banner--${tone}`} role={live}>
      <Icon size={16} aria-hidden="true" className="record-banner__icon" />
      <div className="record-banner__text"><p className="record-banner__title">{title}</p>{children}</div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.schema manager schema.
 * @param {object|null} props.record the saved row, or null for a new one.
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(row: object, isNew: boolean) => void} props.onSaved
 * @param {(id: string) => void} props.onDeleted
 * @param {(text: string, tone?: string) => void} props.notify
 * @param {number} [props.nextOrder] order_index for a new record.
 */
export default function RecordDialog({ schema, record, open, onClose, onSaved, onDeleted, notify, nextOrder = 1 }) {
  const online = useOnline();
  const [mode, setMode] = useState(record?.id ? 'read' : 'edit');
  const [base, setBase] = useState(record);                 // the saved row this dialog compares against
  const [form, setForm] = useState(() => buildForm(schema, record));
  const [touched, setTouched] = useState(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyImages, setBusyImages] = useState(false);
  const [confirm, setConfirm] = useState(null);             // 'close' | 'cancel' | 'delete' | null
  const [failure, setFailure] = useState(null);             // { kind, action, message }
  const [conflict, setConflict] = useState(false);
  const [imageIssues, setImageIssues] = useState([]);
  const [focusTick, setFocusTick] = useState(0);
  const panelRef = useRef(null), openerRef = useRef(null), recordRef = useRef(record);
  recordRef.current = record;

  const isNew = !base?.id;
  const recordId = record?.id;
  const dirty = useMemo(() => isDirty(schema, form, base), [schema, form, base]);
  const allErrors = useMemo(() => validateForm(schema, form), [schema, form]);
  const errors = useMemo(() => (submitted ? allErrors : Object.fromEntries(Object.entries(allErrors).filter(([k]) => touched.has(k)))), [allErrors, submitted, touched]);
  const errorCount = Object.keys(allErrors).length;

  // A fresh dialog whenever it opens or moves to another record. Keyed on the
  // id, not the row object: the deck hands back a new object after every
  // image save, and rebuilding the form then would wipe typed text.
  useEffect(() => {
    if (!open) return;
    const row = recordRef.current;
    setBase(row); setForm(buildForm(schema, row)); setMode(row?.id ? 'read' : 'edit');
    setTouched(new Set()); setSubmitted(false); setConfirm(null); setFailure(null); setConflict(false); setImageIssues([]);
  }, [open, recordId, schema]);

  const backToRead = useCallback(() => {
    setForm(buildForm(schema, base)); setMode('read'); setTouched(new Set()); setSubmitted(false); setFailure(null); setConflict(false); setImageIssues([]);
  }, [schema, base]);

  const requestClose = useCallback(() => { if (saving || busyImages) return; if (mode === 'edit' && dirty) setConfirm('close'); else onClose(); }, [mode, dirty, saving, busyImages, onClose]);
  const cancelEdit = () => { if (isNew) { requestClose(); return; } if (dirty) setConfirm('cancel'); else backToRead(); };

  // The key handler reads the latest state through a ref so the effect below
  // runs once per opening; re-running it on every keystroke would bounce
  // focus back to the card that opened the dialog.
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); if (confirm) setConfirm(null); else requestClose(); return; }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const nodes = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((n) => !n.disabled && !n.closest('[hidden]'));
    if (!nodes.length) return;
    const [head, tail] = [nodes[0], nodes[nodes.length - 1]];
    if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus(); } else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
  };

  // body scroll lock, Escape, focus trap and focus return, once per opening
  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => keyRef.current(e);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = previousOverflow; openerRef.current?.focus?.(); };
  }, [open]);

  // first focus per view: the first field when editing, the Edit button when reading
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const target = mode === 'edit' ? panelRef.current.querySelector('.record-form [data-field] input, .record-form [data-field] textarea, .record-form [data-field] select') : panelRef.current.querySelector('[data-action="edit"]');
    (target || panelRef.current.querySelector(FOCUSABLE))?.focus();
  }, [open, mode, recordId]);

  // after a refused Save, the first invalid field in reading order takes focus
  useEffect(() => {
    if (!focusTick || !panelRef.current) return;
    const field = panelRef.current.querySelector('[data-field].has-error');
    (field?.querySelector('[aria-invalid="true"]') || field?.querySelector(FOCUSABLE))?.focus();
  }, [focusTick]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const leave = (key) => () => setTouched((t) => (t.has(key) ? t : new Set(t).add(key)));

  const fail = (err, action) => setFailure({ kind: failureKind(err), action, message: err?.message || '' });

  const save = async ({ overwrite = false } = {}) => {
    if (!online || saving) return;
    setSubmitted(true);
    if (errorCount) { setFocusTick((t) => t + 1); return; }
    setFailure(null); setConflict(false); setSaving(true);
    try {
      // conflict check: only for updates, and only when the table keeps updated_at
      if (!isNew && !overwrite && base && Object.prototype.hasOwnProperty.call(base, 'updated_at')) {
        const current = await fetchUpdatedAt(schema, base.id);
        if (current === undefined) throw new Error(`This ${schema.singular} no longer exists. It may have been deleted elsewhere; copy anything needed before closing.`);
        if (!sameStamp(current, base.updated_at)) { setConflict(true); return; }
      }
      const payload = normalizeForm(schema, form);
      if (isNew && schema.orderKey) payload[schema.orderKey] = nextOrder;
      const row = await saveRecord(schema, payload, base?.id || null);
      setBase(row); setForm(buildForm(schema, row)); setMode('read'); setTouched(new Set()); setSubmitted(false);
      onSaved(row, isNew);
      notify(isNew ? `${capital(schema.singular)} added.` : 'Saved.');
    } catch (err) { fail(err, 'save'); } finally { setSaving(false); }
  };

  const reloadLatest = async () => {
    setSaving(true); setFailure(null);
    try {
      const row = await getRecord(schema, base.id);
      setBase(row); setForm(buildForm(schema, row)); setConflict(false); setMode('read'); setTouched(new Set()); setSubmitted(false);
      onSaved(row, false);
      notify('Showing the latest saved version.');
    } catch (err) { fail(err, 'reload'); } finally { setSaving(false); }
  };

  const remove = async () => {
    setConfirm(null); setSaving(true); setFailure(null);
    try { await deleteRecord(schema, base.id); onDeleted(base.id); notify(`${capital(schema.singular)} deleted.`); } catch (err) { fail(err, 'delete'); } finally { setSaving(false); }
  };

  const imageField = schema.fields.find((f) => f.kind === 'images');
  // persists only the image column; the base takes the returned row so its
  // updated_at stays current and the next Save does not see a false conflict
  const persistImages = async (urls) => {
    const row = await saveRecord(schema, { [imageField.key]: urls }, base.id);
    setBase(row);
    setForm((f) => ({ ...f, [imageField.key]: urls }));
    onSaved(row, false);
  };
  const images = imageField ? {
    singular: schema.singular, busy: busyImages, canUpload: !isNew && online, problems: imageIssues,
    onUpload: async (files) => {
      const current = form[imageField.key];
      const { accepted, problems } = imageProblems(files, { existing: current.length, max: schema.images?.max || imageField.max || 10 });
      setImageIssues(problems);
      if (!accepted.length) return;
      setBusyImages(true);
      try {
        const { urls, failed } = await uploadImages(schema, base.id, accepted);
        if (urls.length) { await persistImages([...current, ...urls]); notify(urls.length === 1 ? 'Image added.' : `${urls.length} images added.`); }
        setImageIssues([...problems, ...failed]);
      } catch (err) {
        setImageIssues([...problems, { name: null, message: `The images could not be added to the ${schema.singular}. ${failureCopy(failureKind(err), 'save', err?.message).title}` }]);
      } finally { setBusyImages(false); }
    },
    onRemove: async (url) => {
      setBusyImages(true); setImageIssues([]);
      try { await persistImages(form[imageField.key].filter((u) => u !== url)); await removeImage(schema, url); notify('Image removed.'); } catch (err) { setImageIssues([{ name: null, message: `The image could not be removed. ${failureCopy(failureKind(err), 'save', err?.message).title}` }]); } finally { setBusyImages(false); }
    },
  } : undefined;

  if (!open) return null;
  const card = base ? schema.card(base) : null;
  const title = isNew ? `New ${schema.singular}` : (mode === 'edit' && schema.titleKey && String(form[schema.titleKey] || '').trim()) || card?.title || `Edit ${schema.singular}`;
  const busy = saving || busyImages;
  const copy = failure ? failureCopy(failure.kind, failure.action, failure.message) : null;
  const retry = failure?.action === 'delete' ? () => setConfirm('delete') : failure?.action === 'reload' ? reloadLatest : () => save();
  const status = mode !== 'edit' ? '' : submitted && errorCount ? attentionText(errorCount) : saving ? 'Saving' : dirty ? 'Unsaved changes' : isNew ? '' : 'No changes yet';

  return createPortal(
    <div className="record-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <div ref={panelRef} className="record-dialog" role="dialog" aria-modal="true" aria-labelledby="record-title" data-testid="record-dialog" data-mode={mode}>
        <header className="record-dialog__head">
          <div className="record-dialog__titles">
            <div className="voyage-chapter__kicker">{mode === 'edit' ? (isNew ? 'Adding' : 'Editing') : capital(schema.singular)}</div>
            <h3 id="record-title">{title}</h3>
            {mode === 'read' && card?.subtitle ? <p className="record-dialog__sub">{card.subtitle}</p> : null}
          </div>
          <button type="button" className="record-dialog__close" onClick={requestClose} aria-label="Close" disabled={busy}><X size={18} /></button>
        </header>

        <div className="record-dialog__banners">
          {!online && (
            <Banner id="record-offline" tone="warn" icon={WifiOff} title="You are offline." live="status">
              <p>{mode === 'edit' ? 'Saving waits until the connection comes back. Your changes stay here.' : 'Changes wait until the connection comes back.'}</p>
            </Banner>
          )}
          {conflict && (
            <Banner tone="warn" icon={AlertTriangle} title={`This ${schema.singular} changed somewhere else after it was opened here.`}>
              <p>Reload latest shows the saved version and drops the edits made here. Overwrite saves this version over it.</p>
              <div className="record-banner__actions">
                <button type="button" className="voyage-bar__button" onClick={reloadLatest} disabled={busy}><RefreshCw size={14} /><span>Reload latest</span></button>
                <button type="button" className="voyage-bar__button voyage-bar__button--danger" onClick={() => save({ overwrite: true })} disabled={busy || !online}><span>Overwrite</span></button>
              </div>
            </Banner>
          )}
          {copy && (
            <Banner tone="bad" icon={failure.kind === 'session' ? LogIn : failure.kind === 'network' ? WifiOff : AlertCircle} title={copy.title}>
              <p>{copy.body}</p>
              <div className="record-banner__actions">
                {copy.link && <a className="voyage-bar__button" href={copy.link.href} target="_blank" rel="noopener noreferrer"><span>{copy.link.label}</span></a>}
                {copy.retry && <button type="button" className="voyage-bar__button" onClick={retry} disabled={busy || !online}><RefreshCw size={14} /><span>Try again</span></button>}
                <button type="button" className="voyage-bar__button voyage-bar__button--plain" onClick={() => setFailure(null)}><span>Dismiss</span></button>
              </div>
            </Banner>
          )}
        </div>

        <div className="record-dialog__body">
          {mode === 'read' && base
            ? <RecordView schema={schema} row={base} />
            : (
              <form className="record-form" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
                {(schema.groups || [{ label: '', keys: schema.fields.map((f) => f.key) }]).map((group, i) => (
                  <fieldset key={group.label || i} className="record-form__group">
                    {group.label && <legend>{group.label}</legend>}
                    <div className="record-form__grid">
                      {fieldsForGroup(schema, group, i).map((field) => (
                        <div key={field.key} className={`record-form__cell${WIDE_KINDS.has(field.kind) ? ' is-wide' : ''}`}>
                          <Field field={field} value={form[field.key]} error={errors[field.key]} onChange={set(field.key)} onLeave={leave(field.key)} images={images} />
                        </div>
                      ))}
                    </div>
                  </fieldset>
                ))}
                <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
              </form>
            )}
        </div>

        <footer className="record-dialog__foot">
          {mode === 'read'
            ? (
              <>
                <button type="button" className="voyage-bar__button voyage-bar__button--quiet" onClick={() => setConfirm('delete')} disabled={busy || !online}><Trash2 size={15} /><span>Delete</span></button>
                <div className="record-dialog__actions">
                  <button type="button" className="voyage-bar__button voyage-bar__button--plain" onClick={requestClose} disabled={busy}><span>Close</span></button>
                  <button type="button" data-action="edit" className="voyage-bar__button voyage-bar__button--primary" onClick={() => { setFailure(null); setMode('edit'); }} disabled={busy}><Pencil size={14} /><span>Edit</span></button>
                </div>
              </>
            )
            : (
              <>
                <span className={`record-dialog__status${submitted && errorCount ? ' is-bad' : ''}`} aria-live="polite">
                  {submitted && errorCount ? <AlertCircle size={14} aria-hidden="true" /> : null}{status}
                </span>
                <div className="record-dialog__actions">
                  <button type="button" className="voyage-bar__button voyage-bar__button--plain" onClick={cancelEdit} disabled={busy}><span>Cancel</span></button>
                  <button type="button" className="voyage-bar__button voyage-bar__button--primary" onClick={() => save()} disabled={busy || !online || (!dirty && !isNew)} aria-describedby={!online ? 'record-offline' : undefined} title={!online ? 'Saving waits until the connection comes back' : undefined}>
                    <span>{saving ? 'Saving' : isNew ? `Add ${schema.singular}` : 'Save'}</span>
                  </button>
                </div>
              </>
            )}
        </footer>

        <ConfirmDialog open={confirm === 'close'} title="Discard the changes?" body="What was typed in this dialog will be lost." confirmLabel="Discard" tone="danger" onConfirm={() => { setConfirm(null); onClose(); }} onCancel={() => setConfirm(null)} />
        <ConfirmDialog open={confirm === 'cancel'} title="Discard the edits?" body="The saved version stays as it is." confirmLabel="Discard" tone="danger" onConfirm={() => { setConfirm(null); backToRead(); }} onCancel={() => setConfirm(null)} />
        <ConfirmDialog open={confirm === 'delete'} title={`Delete this ${schema.singular}?`} body={imageField ? 'Its images in storage go with it. This cannot be undone.' : 'This cannot be undone.'} confirmLabel="Delete" tone="danger" onConfirm={remove} onCancel={() => setConfirm(null)} />
      </div>
    </div>,
    document.body,
  );
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
