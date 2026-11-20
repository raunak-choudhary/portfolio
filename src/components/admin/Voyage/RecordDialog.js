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
// One request at a time. Save, Reload, Delete and every file action share a
// single lock (`lock`), taken synchronously, so a Save can never run beside
// an upload or a removal and write a list the other has just changed. An
// update writes only the columns the form changed (`changedColumns`), so a
// column the owner did not touch is never rewritten.
//
// Uploads and removals of stored files persist at once (a file in storage
// and a row that does not list it must never drift apart), so files can be
// added only after the first save. A file action writes its one column from
// the stored list, never from the form, so text typed into a mixed list
// stays an unsaved edit; it first checks that the row is still the one this
// dialog loaded, because its write refreshes the dialog's updated_at and
// would otherwise hide a change made elsewhere from the next Save. That covers the projects gallery
// (`images`) and every field with an upload rule (`image`, `file`, `files`).
//
// The read view opens with the record's history line (HistoryLine): when
// it last changed and its own timeline, from the activity log.
//
// Singleton managers (hero, about) open with `editOnly`: the chapter itself
// is the read view, so the dialog is only the form, Save closes it, and
// there is no Delete.
//
// Fix mode (`fix`, from the fix queue's walk): the dialog opens in the form
// with a banner naming the task and the place in the walk, the target field
// ringed, tagged and focused, and Save labelled "Save and next". After the
// save the banner says honestly whether the item now passes ("Fixed. Health
// a → b") and offers the next record or the way back to the queue; an
// editOnly dialog stays open for that instead of closing.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, ArrowRight, Check, LogIn, Pencil, RefreshCw, Trash2, WifiOff, Wrench, X } from 'lucide-react';
import Field from './Field';
import ConfirmDialog from './ConfirmDialog';
import RecordView, { WIDE_KINDS } from './RecordView';
import HistoryLine from './HistoryLine';
import useOnline from './useOnline';
import { UPLOAD_KINDS, applyChange, buildForm, changedColumns, cleanupTargets, fieldsForGroup, isBucketUrl, isDirty, normalizeForm, validateForm } from './managers/schemaModel';
import { round1, gainText } from './fixQueueModel';
import { noteContentChanged } from './contentChanged';
import './FixQueue.css';
import { deleteRecord, failureKind, fetchUpdatedAt, fileProblems, getRecord, imageProblems, removeImage, removeStoredFiles, saveRecord, uploadFieldFiles, uploadImages } from '../../../services/voyageRecords';

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
 * @param {number} [props.nextOrder] order value for a new record (schemas with an orderKey).
 * @param {(payload: object, ctx: {isNew: boolean, base: object|null}) => object} [props.prepare] adds columns the deck owns (a group's priority) to a payload before it is written.
 * @param {boolean} [props.editOnly] the form only: no read view, Save closes, no Delete (singleton chapters).
 * @param {boolean} [props.startInEdit] a saved record opens straight in the form (a record intent with mode 'edit').
 * @param {object|null} [props.fix] the fix walk step, see `fixBannerCopy`: { field, task, step, total, gain, score, next, fieldLabel,
 *   check(row) -> {passes, state}, onSkip(), onStop(), onNext(fixedGain), onQueue() }.
 */
export default function RecordDialog({ schema, record, open, onClose, onSaved, onDeleted, notify, nextOrder = 1, prepare, editOnly = false, startInEdit = false, fix = null }) {
  const online = useOnline();
  const opensInForm = Boolean(fix) || startInEdit || editOnly;
  const [mode, setMode] = useState(record?.id && !opensInForm ? 'read' : 'edit');
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
  const [uploadIssues, setUploadIssues] = useState({});       // field key -> per-file problems
  const [busyField, setBusyField] = useState(null);           // the upload field mid-request
  const [focusTick, setFocusTick] = useState(0);
  const [fixResult, setFixResult] = useState(null);         // after a save in fix mode: { passes, state, before, after }
  const panelRef = useRef(null), openerRef = useRef(null), recordRef = useRef(record);
  recordRef.current = record;
  // One request at a time (see the header). A ref, not state: two handlers fired in the
  // same tick (Save, then Enter in a field) must see each other before React re-renders.
  const lock = useRef(false);
  const beforeConfirm = useRef(null);                       // what had focus when a confirmation opened
  // Fields the owner changed a value in during this editing session (see changedColumns). A ref: read only at Save.
  const edited = useRef(new Set());

  const isNew = !base?.id;
  const recordId = record?.id;
  const dirty = useMemo(() => isDirty(schema, form, base), [schema, form, base]);
  const allErrors = useMemo(() => validateForm(schema, form), [schema, form]);
  const errors = useMemo(() => (submitted ? allErrors : Object.fromEntries(Object.entries(allErrors).filter(([k]) => touched.has(k)))), [allErrors, submitted, touched]);
  const errorCount = Object.keys(allErrors).length;

  // A fresh dialog whenever it opens or moves to another record. Keyed on the
  // id, not the row object: the deck hands back a new object after every
  // image save, and rebuilding the form then would wipe typed text. A layout
  // effect, so the form is rebuilt before the dialog is first painted: as a
  // plain effect the first frame showed the previous opening's form, and text
  // typed into that frame was overwritten a moment later (found by the
  // Unit 4.4 write proof on the live database).
  useLayoutEffect(() => {
    if (!open) return;
    const row = recordRef.current;
    setBase(row); setForm(buildForm(schema, row)); setMode(row?.id && !opensInForm ? 'read' : 'edit');
    setTouched(new Set()); setSubmitted(false); setConfirm(null); setFailure(null); setConflict(false); setImageIssues([]); setUploadIssues({}); setFixResult(null);
    lock.current = false; edited.current = new Set();
  }, [open, recordId, schema, opensInForm]);

  // The deck can stamp this row while the dialog is open: a reorder or a group move writes updated_at on
  // every row it touches. That write is this admin's own, so the dialog takes the newer stamp; without
  // it the next Save here would report a change "somewhere else". Only the stamp moves, never the form.
  const recordStamp = record?.updated_at;
  useEffect(() => {
    if (!open || !recordId || recordStamp == null) return;
    setBase((b) => (b && b.id === recordId && b.updated_at != null && Date.parse(recordStamp) > Date.parse(b.updated_at) ? { ...b, updated_at: recordStamp } : b));
  }, [open, recordId, recordStamp]);

  const backToRead = useCallback(() => {
    setForm(buildForm(schema, base)); setMode('read'); setTouched(new Set()); setSubmitted(false); setFailure(null); setConflict(false); setImageIssues([]); setUploadIssues({});
    edited.current = new Set();
  }, [schema, base]);

  const requestClose = useCallback(() => { if (saving || busyImages || busyField) return; if (mode === 'edit' && dirty) setConfirm('close'); else onClose(); }, [mode, dirty, saving, busyImages, busyField, onClose]);
  const cancelEdit = () => { if (isNew || editOnly) { requestClose(); return; } if (dirty) setConfirm('cancel'); else backToRead(); };

  // The key handler reads the latest state through a ref so the effect below
  // runs once per opening; re-running it on every keystroke would bounce
  // focus back to the card that opened the dialog.
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); if (confirm) setConfirm(null); else requestClose(); return; }
    if (e.key !== 'Tab' || !panelRef.current) return;
    // While a confirmation is open, Tab stays inside it: the controls behind it (Close, Edit, Delete) are out of reach.
    const scope = panelRef.current.querySelector('.dialog') || panelRef.current;
    const nodes = [...scope.querySelectorAll(FOCUSABLE)].filter((n) => !n.disabled && !n.closest('[hidden]'));
    if (!nodes.length) { e.preventDefault(); return; }
    const [head, tail] = [nodes[0], nodes[nodes.length - 1]];
    // Focus can fall out of the dialog when its element is removed (a chip, a pairs row, an image); the
    // page behind is not inert, so the next Tab is pulled back in instead of walking the page.
    const inside = scope.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === head || !inside)) { e.preventDefault(); tail.focus(); } else if (!e.shiftKey && (document.activeElement === tail || !inside)) { e.preventDefault(); head.focus(); }
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

  // A confirmation takes focus when it opens; when it is cancelled, focus goes back to the control that
  // opened it (if it is still there). The opener is noted in a layout effect, which runs before the
  // confirmation's own effect moves focus. The restore is declared before the per-view focus effect,
  // which wins when the confirmation changed the view.
  useLayoutEffect(() => {
    if (open && confirm) beforeConfirm.current = document.activeElement;
  }, [confirm, open]);
  useEffect(() => {
    if (!open) { beforeConfirm.current = null; return; }
    if (confirm) return;
    const back = beforeConfirm.current;
    beforeConfirm.current = null;
    if (back && panelRef.current?.contains(back) && !back.disabled) back.focus();
  }, [confirm, open]);

  // first focus per view: the first field when editing, the Edit button when reading
  // (in fix mode: the target field, then the banner's next step once saved)
  const fixField = fix?.field || null;
  const ringedFocusable = 'input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"])';
  // the whole ringed cell, Missing tag included, sits at the top of the scrolling body, under the banners
  const revealTarget = (node) => node.closest('.record-form__cell')?.scrollIntoView?.({ block: 'start', inline: 'nearest' });
  const fixFocusPending = useRef(false);   // the ringed field could not take focus yet (the row was still arriving, or an upload was busy)
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const ringed = mode === 'edit' && fixField ? panelRef.current.querySelector(`.record-form [data-field="${fixField}"]`) : null;
    const ringedTarget = ringed && !fixResult ? ringed.querySelector(ringedFocusable) : null;
    fixFocusPending.current = Boolean(ringed && !fixResult && !ringedTarget);
    const target = fixResult ? panelRef.current.querySelector('[data-fix-step]')
      : ringedTarget || (mode === 'edit' ? panelRef.current.querySelector('.record-form [data-field] input, .record-form [data-field] textarea, .record-form [data-field] select') : panelRef.current.querySelector('[data-action="edit"]'));
    (target || panelRef.current.querySelector(FOCUSABLE))?.focus(ringed && !fixResult ? { preventScroll: true } : undefined);
    if (ringed && !fixResult) revealTarget(ringed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, recordId, fixField, fixResult]);
  // once the ringed field can take focus it does, for the step that just opened only
  // (an upload field renders its picker only after the row has arrived)
  useEffect(() => {
    if (busyImages || !fixFocusPending.current || !panelRef.current || !fixField) return;
    const input = panelRef.current.querySelector(`.record-form [data-field="${fixField}"]`)?.querySelector(ringedFocusable);
    if (input) { fixFocusPending.current = false; input.focus({ preventScroll: true }); revealTarget(input); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busyImages, isNew, online]);

  // A step fixed by an upload reports Fixed while that request is still finishing, when the banner's
  // buttons are disabled and cannot take focus; once the dialog is idle the next step takes it,
  // unless the owner has already put focus somewhere in the dialog.
  useEffect(() => {
    if (!open || !fixResult || saving || busyImages || busyField || !panelRef.current) return;
    const step = panelRef.current.querySelector('[data-fix-step]');
    if (step && !step.disabled && !panelRef.current.contains(document.activeElement)) step.focus();
  }, [open, fixResult, saving, busyImages, busyField]);

  // after a refused Save, the first invalid field in reading order takes focus
  useEffect(() => {
    if (!focusTick || !panelRef.current) return;
    const field = panelRef.current.querySelector('[data-field].has-error');
    (field?.querySelector('[aria-invalid="true"]') || field?.querySelector(FOCUSABLE))?.focus();
  }, [focusTick]);

  const set = (key) => (value) => { edited.current.add(key); setForm((f) => applyChange(schema, f, key, value)); };
  const leave = (key) => () => setTouched((t) => (t.has(key) ? t : new Set(t).add(key)));

  const fail = (err, action) => setFailure({ kind: failureKind(err), action, message: err?.message || '' });

  // The conflict check, shared by Save and by every file action: only for a saved row, and only
  // when the table keeps updated_at. False (with the conflict banner up) when the row changed elsewhere.
  const stillCurrent = async () => {
    if (isNew || !base || !Object.prototype.hasOwnProperty.call(base, 'updated_at')) return true;
    const current = await fetchUpdatedAt(schema, base.id);
    if (current === undefined) throw new Error(`This ${schema.singular} no longer exists. It may have been deleted elsewhere; copy anything needed before closing.`);
    if (sameStamp(current, base.updated_at)) return true;
    setConflict(true);
    return false;
  };

  const save = async ({ overwrite = false } = {}) => {
    // Enter in a text input submits the form even while the Save button is disabled, so every
    // condition the button has is repeated here: nothing else in flight, and something to save.
    if (!online || lock.current) return;
    if (!isNew && !dirty && !overwrite) return;
    setSubmitted(true);
    if (errorCount) { setFocusTick((t) => t + 1); return; }
    lock.current = true;
    setFailure(null); setConflict(false); setSaving(true);
    try {
      if (!overwrite && !(await stillCurrent())) return;
      let payload = normalizeForm(schema, form);
      // a new record goes after the others unless the form itself sets the
      // order (internships show "Display order" as a field as well as a drag)
      if (isNew && schema.orderKey && (payload[schema.orderKey] === null || payload[schema.orderKey] === undefined)) payload[schema.orderKey] = nextOrder;
      if (prepare) payload = prepare(payload, { isNew, base });
      // An update writes only what changed, plus a field the owner changed whose stored value is
      // not what the form shows for it. "Overwrite" is the owner's explicit choice to put this
      // version over the one saved elsewhere, so it writes every column, except the file columns:
      // those are written the moment a file is added or removed, so the form's copy of them is
      // only ever stale, and writing it would re-list files removed elsewhere and drop new ones.
      if (!isNew && !overwrite) payload = changedColumns(schema, payload, base, edited.current);
      else if (!isNew) {
        const fileKeys = new Set(schema.fields.filter((f) => UPLOAD_KINDS.has(f.kind)).map((f) => f.key));
        const changedFiles = changedColumns(schema, payload, base);
        payload = Object.fromEntries(Object.entries(payload).filter(([key]) => !fileKeys.has(key) || key in changedFiles));
      }
      const row = await saveRecord(schema, payload, base?.id || null);
      setBase(row); setForm(buildForm(schema, row)); setMode(editOnly && !fix ? 'edit' : 'read'); setTouched(new Set()); setSubmitted(false);
      edited.current = new Set();
      onSaved(row, isNew);
      noteContentChanged();
      notify(isNew ? `${capital(schema.singular)} added.` : 'Saved.');
      if (fix) {
        const result = fix.check ? fix.check(row) : { passes: true, state: null };
        setFixResult({ ...result, before: fix.score, after: fix.score + (result.passes ? fix.gain : 0) });
      } else if (editOnly) onClose();
    } catch (err) { fail(err, 'save'); } finally { lock.current = false; setSaving(false); }
  };

  const reloadLatest = async () => {
    if (lock.current) return;
    lock.current = true;
    setSaving(true); setFailure(null);
    try {
      const row = await getRecord(schema, base.id);
      setBase(row); setForm(buildForm(schema, row)); setConflict(false); setMode(editOnly ? 'edit' : 'read'); setTouched(new Set()); setSubmitted(false);
      edited.current = new Set();
      onSaved(row, false);
      notify('Showing the latest saved version.');
    } catch (err) { fail(err, 'reload'); } finally { lock.current = false; setSaving(false); }
  };

  const remove = async () => {
    setConfirm(null);
    if (lock.current) return;
    lock.current = true;
    setSaving(true); setFailure(null);
    try { await deleteRecord(schema, base.id, base); onDeleted(base.id); noteContentChanged(); notify(`${capital(schema.singular)} deleted.`); } catch (err) { fail(err, 'delete'); } finally { lock.current = false; setSaving(false); }
  };

  const imageField = schema.fields.find((f) => f.kind === 'images');
  /** The list a column holds in the saved row (never the form's copy, which may carry unsaved entries). */
  const storedList = (key) => (Array.isArray(base?.[key]) ? base[key].map(String) : []);
  const CONFLICT_ISSUE = { name: null, message: `This ${schema.singular} changed somewhere else. Reload the latest version, then try again.` };
  // After a failed file write: the uploaded files the stored row does not name, which may leave
  // storage again. The row is read back because "failed" is not proof: an update can commit and
  // lose its answer on the way (a connection flap), and removing those files would leave the
  // row, and the public page, pointing at nothing. When the row cannot be read, nothing is
  // removed: an orphan is listed by the media library, a dead link is seen by visitors.
  const orphansOf = async (key, urls) => {
    if (!urls.length) return [];
    try {
      const row = await getRecord(schema, base.id);
      const named = new Set((Array.isArray(row?.[key]) ? row[key] : [row?.[key]]).filter(Boolean).map(String));
      return urls.filter((url) => !named.has(String(url)));
    } catch { return []; }
  };
  // Persists only the image column, built from the stored list. The base takes the returned
  // row so its updated_at stays current and the next Save does not see a false conflict.
  // `written` runs the moment the row has taken the list, before any step that could throw.
  const persistImages = async (change, written) => {
    const next = change(storedList(imageField.key));
    const row = await saveRecord(schema, { [imageField.key]: next }, base.id);
    written?.();
    setBase(row);
    setForm((f) => ({ ...f, [imageField.key]: change(f[imageField.key]) }));
    onSaved(row, false);
    noteContentChanged();
    fixedByUpload(row, imageField.key, change(form[imageField.key]));
  };
  // In fix mode an upload is the save: the column is written at once, so the
  // form never gets dirty and "Save and next" would never light up. When the
  // stored row now passes the check, the step reports Fixed exactly as a save
  // does (and stays in the form if other edits are still unsaved).
  const fixedByUpload = (row, key, value) => {
    if (!fix || fixResult || !fix.check) return;
    const result = fix.check(row);
    if (!result.passes) return;
    setFixResult({ ...result, before: fix.score, after: fix.score + fix.gain });
    if (!isDirty(schema, { ...form, [key]: value }, row)) { setMode('read'); setTouched(new Set()); setSubmitted(false); }
  };
  const images = imageField ? {
    singular: schema.singular, busy: busyImages, canUpload: !isNew && online, locked: saving || Boolean(busyField), problems: imageIssues,
    onUpload: async (files) => {
      if (lock.current) return;
      const { accepted, problems } = imageProblems(files, { existing: form[imageField.key].length, max: schema.images?.max || imageField.max || 10 });
      setImageIssues(problems);
      if (!accepted.length) return;
      lock.current = true;
      setBusyImages(true);
      let unlisted = [];                                    // uploaded, not yet named by the row
      try {
        if (!(await stillCurrent())) { setImageIssues([...problems, CONFLICT_ISSUE]); return; }
        const { urls, failed } = await uploadImages(schema, base.id, accepted);
        unlisted = urls;
        if (urls.length) { await persistImages((list) => [...list, ...urls], () => { unlisted = []; }); notify(urls.length === 1 ? 'Image added.' : `${urls.length} images added.`); }
        setImageIssues([...problems, ...failed]);
      } catch (err) {
        // files the row did not take leave storage again instead of staying as orphans
        await Promise.all((await orphansOf(imageField.key, unlisted)).map((url) => removeImage(schema, url).catch(() => null)));
        setImageIssues([...problems, { name: null, message: `The images could not be added to the ${schema.singular}. ${failureCopy(failureKind(err), 'save', err?.message).title}` }]);
      } finally { lock.current = false; setBusyImages(false); }
    },
    onRemove: async (url) => {
      if (lock.current) return;
      lock.current = true;
      setBusyImages(true); setImageIssues([]);
      try {
        if (!(await stillCurrent())) { setImageIssues([CONFLICT_ISSUE]); return; }
        await persistImages((list) => list.filter((u) => u !== url)); await removeImage(schema, url); notify('Image removed.');
      } catch (err) { setImageIssues([{ name: null, message: `The image could not be removed. ${failureCopy(failureKind(err), 'save', err?.message).title}` }]); } finally { lock.current = false; setBusyImages(false); }
    },
  } : undefined;

  // One uploader per field with an upload rule. The stored list or URL is
  // written to the row at once (only that column, built from what the row
  // holds), and a replaced or removed file leaves storage after the row stops
  // pointing at it. `change` maps a list to its next state and is applied to
  // the stored list for the write and to the form's own list for the screen,
  // so entries typed into a mixed list (before or during an upload) stay in
  // the form as unsaved edits: never written silently, never wiped.
  const persistField = async (key, many, change, written) => {
    const next = many ? change(storedList(key)) : change();
    const row = await saveRecord(schema, { [key]: next }, base.id);
    written?.();
    setBase(row);
    setForm((f) => ({ ...f, [key]: many ? change(f[key]) : next }));
    onSaved(row, false);
    noteContentChanged();
    fixedByUpload(row, key, many ? change(form[key]) : next);
  };
  const uploaderFor = (field) => {
    const rule = field.upload;
    const issues = uploadIssues[field.key] || [];
    const setIssues = (list) => setUploadIssues((m) => ({ ...m, [field.key]: list }));
    const many = field.kind === 'files';
    const failed = (what, err) => [{ name: null, message: `The ${what} could not be ${what === 'file' || what === 'image' ? 'changed' : 'updated'}. ${failureCopy(failureKind(err), 'save', err?.message).title}` }];
    return {
      singular: schema.singular, accept: rule.accept, busy: busyField === field.key, canUpload: !isNew && online, problems: issues,
      // another request owns the dialog: a Save, the gallery, or another field's upload
      locked: saving || busyImages || Boolean(busyField && busyField !== field.key),
      // a file this field stored, as opposed to a web address typed into a mixed list
      owns: (url) => isBucketUrl(url, rule.bucket),
      onUpload: async (files) => {
        if (lock.current) return;
        const current = form[field.key];
        const { accepted, problems } = fileProblems(files, rule, { existing: many ? current.length : 0 });
        setIssues(problems);
        if (!accepted.length) return;
        lock.current = true;
        setBusyField(field.key);
        let unlisted = [];                                  // uploaded, not yet named by the row
        try {
          if (!(await stillCurrent())) { setIssues([...problems, CONFLICT_ISSUE]); return; }
          const { urls, failed: lost } = await uploadFieldFiles(rule, { id: base.id, form }, accepted);
          unlisted = urls;
          if (urls.length) {
            const taken = () => { unlisted = []; };
            if (many) await persistField(field.key, true, (list) => [...list, ...urls], taken);
            else {
              const replaced = base[field.key];
              await persistField(field.key, false, () => urls[0], taken);
              if (replaced && replaced !== urls[0] && rule.removeReplaced) await removeStoredFiles(rule.bucket, [replaced]);
            }
            notify(many ? (urls.length === 1 ? 'File added.' : `${urls.length} files added.`) : field.kind === 'image' ? 'Image saved.' : 'File saved.');
          }
          setIssues([...problems, ...lost]);
        } catch (err) {
          // files the row did not take leave storage again instead of staying as orphans
          const orphans = await orphansOf(field.key, unlisted);
          if (orphans.length) await removeStoredFiles(rule.bucket, orphans).catch(() => null);
          setIssues([...problems, ...failed(field.kind === 'image' ? 'image' : 'file', err)]);
        } finally { lock.current = false; setBusyField(null); }
      },
      onRemove: async (url) => {
        if (lock.current) return;
        lock.current = true;
        setBusyField(field.key); setIssues([]);
        try {
          if (!(await stillCurrent())) { setIssues([CONFLICT_ISSUE]); return; }
          await persistField(field.key, many, many ? (list) => list.filter((u) => u !== url) : () => null);
          if (rule.removeReplaced) await removeStoredFiles(rule.bucket, [url]);
          notify(field.kind === 'image' ? 'Image removed.' : 'File removed.');
        } catch (err) { setIssues(failed(field.kind === 'image' ? 'image' : 'file', err)); } finally { lock.current = false; setBusyField(null); }
      },
    };
  };

  if (!open) return null;
  const card = base ? schema.card(base) : null;
  const title = isNew ? `New ${schema.singular}` : (mode === 'edit' && schema.titleKey && String(form[schema.titleKey] || '').trim()) || card?.title || `Edit ${schema.singular}`;
  const busy = saving || busyImages || Boolean(busyField);
  const ownsFiles = Boolean(imageField) || cleanupTargets(schema, base || {}).length > 0;
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
          {fix && <FixBanner fix={fix} result={fixResult} busy={busy} onSkip={() => (mode === 'edit' && dirty ? setConfirm('skip') : fix.onSkip())} onStop={() => (mode === 'edit' && dirty ? setConfirm('stop') : fix.onStop())} onEditAgain={() => { setFixResult(null); setMode('edit'); }}
            onNext={() => (mode === 'edit' && dirty ? setConfirm('next') : fix.onNext(fixResult?.passes ? fix.gain : 0))}
            onQueue={() => (mode === 'edit' && dirty ? setConfirm('queue') : fix.onQueue())} />}
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
                <button type="button" className="voyage-bar__button voyage-bar__button--danger" onClick={() => save({ overwrite: true })} disabled={busy || !online || !dirty} title={dirty ? undefined : 'Nothing was changed here, so there is nothing to save over it'}><span>Overwrite</span></button>
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
            ? <>{schema.table && base.id ? <HistoryLine table={schema.table} recordId={base.id} /> : null}<RecordView schema={schema} row={base} /></>
            : (
              <form className="record-form" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
                {(schema.groups || [{ label: '', keys: schema.fields.map((f) => f.key) }]).map((group, i) => (
                  <fieldset key={group.label || i} className="record-form__group">
                    {group.label && <legend>{group.label}</legend>}
                    <div className="record-form__grid">
                      {fieldsForGroup(schema, group, i).map((field) => (
                        <div key={field.key} className={`record-form__cell${WIDE_KINDS.has(field.kind) ? ' is-wide' : ''}${field.key === fixField ? ' is-target' : ''}`}>
                          {field.key === fixField && <span className="fix-missing" aria-hidden="true">{fix.state === 'weak' ? 'Too short' : 'Missing'}</span>}
                          <Field field={field} value={form[field.key]} form={form} error={errors[field.key]} onChange={set(field.key)} onLeave={leave(field.key)} images={images} upload={UPLOAD_KINDS.has(field.kind) && field.upload ? uploaderFor(field) : undefined} />
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
          {fix && fixResult && mode === 'read'
            ? (
              <>
                <span className="record-dialog__status"><Check size={14} aria-hidden="true" />Saved just now</span>
                <div className="record-dialog__actions">
                  <button type="button" className="voyage-bar__button voyage-bar__button--primary" onClick={fix.onStop}><Check size={14} /><span>Done</span></button>
                </div>
              </>
            )
            : mode === 'read'
            ? (
              <>
                {schema.mode === 'singleton' ? <span /> : <button type="button" className="voyage-bar__button voyage-bar__button--quiet" onClick={() => setConfirm('delete')} disabled={busy || !online}><Trash2 size={15} /><span>Delete</span></button>}
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
                    <span>{saving ? 'Saving' : isNew ? `Add ${schema.singular}` : fix ? 'Save and next' : 'Save'}</span>
                  </button>
                </div>
              </>
            )}
        </footer>

        <ConfirmDialog open={confirm === 'close'} title="Discard the changes?" body="What was typed in this dialog will be lost." confirmLabel="Discard" tone="danger" onConfirm={() => { setConfirm(null); onClose(); }} onCancel={() => setConfirm(null)} />
        <ConfirmDialog open={confirm === 'cancel'} title="Discard the edits?" body="The saved version stays as it is." confirmLabel="Discard" tone="danger" onConfirm={() => { setConfirm(null); backToRead(); }} onCancel={() => setConfirm(null)} />
        <ConfirmDialog open={confirm === 'skip'} title="Skip without saving?" body="What was typed for this one will be lost." confirmLabel="Skip" tone="danger" onConfirm={() => { setConfirm(null); fix?.onSkip(); }} onCancel={() => setConfirm(null)} />
        <ConfirmDialog open={confirm === 'next'} title="Move on without saving?" body="The upload is saved; other changes typed here will be lost." confirmLabel="Move on" tone="danger" onConfirm={() => { setConfirm(null); fix?.onNext(fixResult?.passes ? fix.gain : 0); }} onCancel={() => setConfirm(null)} />
        <ConfirmDialog open={confirm === 'queue'} title="Back to the queue without saving?" body="The upload is saved; other changes typed here will be lost." confirmLabel="Back to the queue" tone="danger" onConfirm={() => { setConfirm(null); fix?.onQueue(); }} onCancel={() => setConfirm(null)} />
        <ConfirmDialog open={confirm === 'stop'} title="Stop without saving?" body="What was typed for this one will be lost." confirmLabel="Stop fixing" tone="danger" onConfirm={() => { setConfirm(null); fix?.onStop(); }} onCancel={() => setConfirm(null)} />
        <ConfirmDialog open={confirm === 'delete'} title={`Delete this ${schema.singular}?`} body={ownsFiles ? 'Its files in storage go with it. This cannot be undone.' : 'This cannot be undone.'} confirmLabel="Delete" tone="danger" onConfirm={remove} onCancel={() => setConfirm(null)} />
      </div>
    </div>,
    document.body,
  );
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The fix banner's words for one step of the walk, before and after the save.
 * Pure, so the copy is tested without rendering.
 */
export function fixBannerCopy(fix, result) {
  const step = `${fix.step} of ${fix.total}`;
  const left = fix.total - fix.step;
  const nextLine = fix.next ? `Next: ${fix.next.label}.` : 'That was the last one in this group.';
  if (!result) {
    return { tone: 'fix', title: `Fixing: ${fix.task}`, step, body: `Worth ${gainText(fix.gain)} to the health score. ${fix.next ? `Save, then move on to ${fix.next.label}.` : 'This is the last one in this group.'}` };
  }
  if (result.inactive) {
    return { tone: 'warn', title: 'Saved, but hiding it is not a fix.', step: null, body: `A hidden record leaves the score, and the gap is still there for when it comes back. ${nextLine}` };
  }
  if (result.passes) {
    return { tone: 'good', title: `Fixed. Health ${round1(result.before).toFixed(1)} → ${round1(result.after).toFixed(1)}`, step: null, body: `${left ? `${left} left in this group. ` : ''}${nextLine}` };
  }
  return {
    tone: 'warn', title: 'Saved, but this one still needs work.', step: null,
    body: `${result.state === 'weak' ? `The ${fix.fieldLabel.toLowerCase()} is still under 40 characters.` : `The ${fix.fieldLabel.toLowerCase()} is still empty.`} ${nextLine}`,
  };
}

function FixBanner({ fix, result, busy, onSkip, onStop, onEditAgain, onNext, onQueue }) {
  const copy = fixBannerCopy(fix, result);
  const Icon = copy.tone === 'good' ? Check : copy.tone === 'warn' ? AlertTriangle : Wrench;
  return (
    <div className={`record-banner record-banner--${copy.tone}`} role="status" data-testid="fix-banner">
      <Icon size={18} aria-hidden="true" className="record-banner__icon" />
      <div className="record-banner__text">
        <p className="record-banner__title">{copy.title}{copy.step && <span className="record-banner__step"> · {copy.step}</span>}</p>
        <p>{copy.body}</p>
        <div className="record-banner__actions">
          {!result && <button type="button" className="voyage-bar__button voyage-bar__button--small" onClick={onSkip} disabled={busy}><ArrowRight size={15} /><span>Skip this one</span></button>}
          {!result && <button type="button" className="voyage-bar__button voyage-bar__button--small" onClick={onStop} disabled={busy}><span>Stop fixing</span></button>}
          {/* Disabled while a request is in flight: moving to another record mid-upload would let the old request release the new record's lock. */}
          {result && !result.passes && <button type="button" className="voyage-bar__button voyage-bar__button--small" onClick={onEditAgain} disabled={busy}><Pencil size={14} /><span>Edit again</span></button>}
          {result && fix.next && <button type="button" data-fix-step className="voyage-bar__button voyage-bar__button--small voyage-bar__button--primary" onClick={onNext} disabled={busy}><ArrowRight size={15} /><span>Next: {fix.next.label}</span></button>}
          {result && <button type="button" data-fix-step={fix.next ? undefined : true} className="voyage-bar__button voyage-bar__button--small" onClick={onQueue} disabled={busy}><span>Back to the queue</span></button>}
        </div>
      </div>
    </div>
  );
}
