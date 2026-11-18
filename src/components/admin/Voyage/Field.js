// src/components/admin/Voyage/Field.js
//
// One form field of the record dialog, rendered by its schema kind. Quiet by
// design: plain labelled inputs on glass, a character count where a limit
// exists, the error sentence under the field, nothing animated. Lists
// (tags, links) are chips with an input that adds on Enter; images are
// thumbnails with a remove button, a file picker and a per-file problem list.
//
// Accessibility: the control carries aria-invalid and aria-describedby
// pointing at the error (or the help line), and the error starts with an
// icon and reads as a full sentence, so it never relies on colour alone.
// `data-field` lets the dialog focus the first invalid field after Save.

import React, { useId, useState } from 'react';
import { AlertCircle, Plus, X } from 'lucide-react';
import { addListItem } from './managers/schemaModel';

function ListInput({ field, value, onChange, inputId, a11y }) {
  const [draft, setDraft] = useState('');
  const add = () => { const next = addListItem(value, draft); if (next !== value) onChange(next); setDraft(''); };
  return (
    <div className="chips">
      {value.map((item, i) => (
        <span key={`${item}-${i}`} className="chip">
          <span className="chip__text">{item}</span>
          <button type="button" className="chip__remove" aria-label={`Remove ${item}`} onClick={() => onChange(value.filter((_, k) => k !== i))}><X size={12} /></button>
        </span>
      ))}
      <div className="chips__add">
        <input id={inputId} type={field.kind === 'urls' ? 'url' : 'text'} value={draft} placeholder={field.kind === 'urls' ? 'https://' : 'Add and press Enter'} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} {...a11y} />
        <button type="button" className="voyage-bar__button voyage-bar__button--small" onClick={add} aria-label={`Add to ${field.label}`}><Plus size={14} /><span>Add</span></button>
      </div>
    </div>
  );
}

function ImagesInput({ value, images, inputId, problemsId }) {
  return (
    <>
      <div className="thumbs">
        {value.map((url) => (
          <figure key={url} className="thumb">
            <img src={url} alt="" loading="lazy" />
            <button type="button" className="thumb__remove" aria-label="Remove image" onClick={() => images.onRemove(url)} disabled={images.busy}><X size={12} /></button>
          </figure>
        ))}
        {images.canUpload
          ? (
            <label className={`thumb thumb--add${images.busy ? ' is-busy' : ''}`}>
              <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={images.busy} aria-describedby={images.problems?.length ? problemsId : undefined} onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) images.onUpload(files); }} />
              <Plus size={18} /><span>{images.busy ? 'Uploading' : 'Add images'}</span>
            </label>
          )
          : <p className="field__help">Save the {images.singular} once, then add images.</p>}
      </div>
      {images.problems?.length ? (
        <ul id={problemsId} className="field__problems" role="alert">
          {images.problems.map((p, i) => <li key={`${p.name}-${i}`}><AlertCircle size={13} aria-hidden="true" /><span>{p.name ? <><b>{p.name}</b> {p.message}</> : p.message}</span></li>)}
        </ul>
      ) : null}
    </>
  );
}

/**
 * @param {object} props
 * @param {object} props.field schema field.
 * @param {*} props.value current form value.
 * @param {string} [props.error] fixed sentence to show under the field (already filtered by the dialog's timing rules).
 * @param {(value: *) => void} props.onChange
 * @param {() => void} [props.onLeave] called when focus leaves the whole field (not on moves inside it, such as chip to input).
 * @param {{onUpload: Function, onRemove: Function, busy: boolean, canUpload: boolean, singular: string, problems?: Array}} [props.images] for image fields.
 */
export default function Field({ field, value, error, onChange, onLeave, images }) {
  const id = useId();
  const errorId = `${id}-error`, helpId = `${id}-help`;
  const count = (field.kind === 'text' || field.kind === 'textarea' || field.kind === 'url') && field.max ? `${String(value || '').length}/${field.max}` : null;
  const a11y = { 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? errorId : field.help ? helpId : undefined };
  let control;
  switch (field.kind) {
    case 'textarea': control = <textarea id={id} rows={field.rows || 4} value={value} onChange={(e) => onChange(e.target.value)} {...a11y} />; break;
    case 'number': control = <input id={id} type="number" inputMode="numeric" value={value} min={field.min} max={field.max} step={field.integer ? 1 : 'any'} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} {...a11y} />; break;
    case 'toggle': control = <button id={id} type="button" role="switch" aria-checked={!!value} className={`switch${value ? ' is-on' : ''}`} onClick={() => onChange(!value)} aria-describedby={a11y['aria-describedby']}><i /></button>; break;
    case 'select': control = <select id={id} value={value} onChange={(e) => onChange(e.target.value)} {...a11y}>{(field.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>; break;
    case 'tags': case 'urls': control = <ListInput field={field} value={value} onChange={onChange} inputId={id} a11y={a11y} />; break;
    case 'images': control = <ImagesInput value={value} images={images} inputId={id} problemsId={`${id}-problems`} />; break;
    default: control = <input id={id} type={field.kind === 'url' ? 'url' : 'text'} value={value} maxLength={field.max ? field.max + 20 : undefined} onChange={(e) => onChange(e.target.value)} {...a11y} />;
  }
  // focusout bubbles in React; ignore moves between parts of the same field
  const onBlur = onLeave ? (e) => { if (!e.currentTarget.contains(e.relatedTarget)) onLeave(); } : undefined;
  return (
    <div className={`field field--${field.kind}${error ? ' has-error' : ''}`} data-field={field.key} onBlur={onBlur}>
      <div className="field__row"><label htmlFor={id}>{field.label}{field.required ? <span aria-hidden="true"> *</span> : null}</label>{count && <span className="field__count">{count}</span>}</div>
      {control}
      {error
        ? <p id={errorId} className="field__error"><AlertCircle size={13} aria-hidden="true" /><span>{error}</span></p>
        : field.help ? <p id={helpId} className="field__help">{field.help}</p> : null}
    </div>
  );
}
