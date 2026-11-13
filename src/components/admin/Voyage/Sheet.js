// src/components/admin/Voyage/Sheet.js
//
// The editor sheet: slides in from the right over the voyage, owns its own
// scroll, traps focus, closes on Escape, guards unsaved changes, and ends in
// a sticky save bar. Built once for every manager from its schema. A new
// record is saved first and then stays open as that record, so images can be
// added straight away. Image uploads and removals persist at once, because a
// file in storage and a row that does not list it must never drift apart.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import Field from './Field';
import ConfirmDialog from './ConfirmDialog';
import { buildForm, fieldsForGroup, isDirty, normalizeForm, validateForm } from './managers/schemaModel';
import { deleteRecord, imageProblem, removeImage, saveRecord, uploadImages } from '../../../services/voyageRecords';

const FOCUSABLE = 'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])';

/**
 * @param {object} props
 * @param {object} props.schema manager schema.
 * @param {object|null} props.record the row being edited, or null for a new one.
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(row: object, isNew: boolean) => void} props.onSaved
 * @param {(id: string) => void} props.onDeleted
 * @param {(text: string, tone?: string) => void} props.notify
 * @param {number} [props.nextOrder] order_index for a new record.
 */
export default function Sheet({ schema, record, open, onClose, onSaved, onDeleted, notify, nextOrder = 1 }) {
  const [form, setForm] = useState(() => buildForm(schema, record));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [busyImages, setBusyImages] = useState(false);
  const [confirm, setConfirm] = useState(null);   // 'discard' | 'delete' | null
  const panelRef = useRef(null), openerRef = useRef(null);
  const dirty = useMemo(() => isDirty(schema, form, record), [schema, form, record]);
  const isNew = !record?.id;

  // a fresh form whenever the sheet opens on a different record
  useEffect(() => { if (open) { setForm(buildForm(schema, record)); setErrors({}); setConfirm(null); } }, [open, record, schema]);

  const requestClose = useCallback(() => { if (saving || busyImages) return; if (dirty) setConfirm('discard'); else onClose(); }, [dirty, saving, busyImages, onClose]);

  // body scroll lock, Escape, first focus, focus return and a simple trap
  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = panelRef.current?.querySelector(FOCUSABLE); first?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); requestClose(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((n) => !n.disabled);
      if (!nodes.length) return;
      const [head, tail] = [nodes[0], nodes[nodes.length - 1]];
      if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus(); } else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = previousOverflow; openerRef.current?.focus?.(); };
  }, [open, requestClose]);

  const set = (key) => (value) => { setForm((f) => ({ ...f, [key]: value })); setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e)); };

  const save = async () => {
    const found = validateForm(schema, form);
    setErrors(found);
    if (Object.keys(found).length) { notify('Fix the marked fields first.', 'warn'); panelRef.current?.querySelector('[aria-invalid="true"]')?.focus(); return; }
    setSaving(true);
    try {
      const payload = normalizeForm(schema, form);
      if (isNew && schema.orderKey) payload[schema.orderKey] = nextOrder;
      const row = await saveRecord(schema, payload, record?.id || null);
      onSaved(row, isNew);
      notify(isNew ? `${capital(schema.singular)} added.` : 'Saved.');
    } catch (err) { notify(err.message || 'The change could not be saved.', 'bad'); } finally { setSaving(false); }
  };

  const remove = async () => {
    setConfirm(null); setSaving(true);
    try { await deleteRecord(schema, record.id); onDeleted(record.id); notify(`${capital(schema.singular)} deleted.`); } catch (err) { notify(err.message || 'It could not be deleted.', 'bad'); } finally { setSaving(false); }
  };

  const imageField = schema.fields.find((f) => f.kind === 'images');
  const persistImages = async (urls) => {
    const row = await saveRecord(schema, { [imageField.key]: urls }, record.id);
    setForm((f) => ({ ...f, [imageField.key]: urls }));
    onSaved(row, false);
  };
  const images = imageField ? {
    singular: schema.singular, busy: busyImages, canUpload: !isNew,
    onUpload: async (files) => {
      const problem = imageProblem(files, { existing: form[imageField.key].length, max: schema.images?.max || imageField.max || 10 });
      if (problem) { notify(problem, 'warn'); return; }
      setBusyImages(true);
      try { const urls = await uploadImages(schema, record.id, files); await persistImages([...form[imageField.key], ...urls]); notify(urls.length === 1 ? 'Image added.' : `${urls.length} images added.`); } catch (err) { notify(err.message || 'The upload failed.', 'bad'); } finally { setBusyImages(false); }
    },
    onRemove: async (url) => {
      setBusyImages(true);
      try { await persistImages(form[imageField.key].filter((u) => u !== url)); await removeImage(schema, url); notify('Image removed.'); } catch (err) { notify(err.message || 'The image could not be removed.', 'bad'); } finally { setBusyImages(false); }
    },
  } : undefined;

  if (!open) return null;
  const title = isNew ? `New ${schema.singular}` : (form.title || record.title || record.name || `Edit ${schema.singular}`);
  const errorCount = Object.values(errors).filter(Boolean).length;
  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <aside ref={panelRef} className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" data-testid="sheet">
        <header className="sheet__head">
          <div><div className="voyage-chapter__kicker">{isNew ? 'new' : 'edit'} · {schema.singular}</div><h3 id="sheet-title">{title}</h3></div>
          <button type="button" className="voyage-bar__button voyage-bar__button--quiet voyage-bar__button--icon" onClick={requestClose} aria-label="Close"><X size={18} /></button>
        </header>
        <form className="sheet__body" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
          {(schema.groups || [{ label: '', keys: schema.fields.map((f) => f.key) }]).map((group, i) => (
            <fieldset key={group.label || i} className="sheet__group">
              {group.label && <legend>{group.label}</legend>}
              {fieldsForGroup(schema, group, i).map((field) => <Field key={field.key} field={field} value={form[field.key]} error={errors[field.key]} onChange={set(field.key)} images={images} />)}
            </fieldset>
          ))}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
        <footer className="sheet__foot">
          <span className="sheet__status">{errorCount ? `${errorCount} to fix` : dirty ? 'Unsaved changes' : isNew ? '' : 'Saved'}</span>
          <div className="sheet__actions">
            {!isNew && <button type="button" className="voyage-bar__button voyage-bar__button--quiet" onClick={() => setConfirm('delete')} disabled={saving || busyImages}><Trash2 size={15} /><span>Delete</span></button>}
            <button type="button" className="voyage-bar__button voyage-bar__button--quiet" onClick={requestClose} disabled={saving || busyImages}>{dirty ? 'Cancel' : 'Close'}</button>
            <button type="button" className="voyage-bar__button voyage-bar__button--primary" onClick={save} disabled={saving || busyImages || (!dirty && !isNew)}>{saving ? 'Saving' : isNew ? `Add ${schema.singular}` : 'Save'}</button>
          </div>
        </footer>
        <ConfirmDialog open={confirm === 'discard'} title="Discard the changes?" body="What you typed in this sheet will be lost." confirmLabel="Discard" tone="danger" onConfirm={() => { setConfirm(null); onClose(); }} onCancel={() => setConfirm(null)} />
        <ConfirmDialog open={confirm === 'delete'} title={`Delete this ${schema.singular}?`} body={imageField ? 'Its images in storage go with it. This cannot be undone.' : 'This cannot be undone.'} confirmLabel="Delete" tone="danger" onConfirm={remove} onCancel={() => setConfirm(null)} />
      </aside>
    </div>,
    document.body,
  );
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
