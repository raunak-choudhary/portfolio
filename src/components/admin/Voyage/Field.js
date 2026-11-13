// src/components/admin/Voyage/Field.js
//
// One form field of the editor sheet, rendered by its schema kind. Quiet by
// design: plain labelled inputs on glass, a character count where a limit
// exists, the error sentence under the field, nothing animated. Lists
// (tags, links) are chips with an input that adds on Enter; images are
// thumbnails with a remove button and a file picker.

import React, { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { addListItem } from './managers/schemaModel';

function ListInput({ field, value, onChange, inputId }) {
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
        <input id={inputId} type={field.kind === 'urls' ? 'url' : 'text'} value={draft} placeholder={field.kind === 'urls' ? 'https://' : 'Add and press Enter'} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" className="voyage-bar__button voyage-bar__button--small" onClick={add} aria-label={`Add to ${field.label}`}><Plus size={14} /><span>Add</span></button>
      </div>
    </div>
  );
}

function ImagesInput({ field, value, images, inputId }) {
  return (
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
            <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={images.busy} onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) images.onUpload(files); }} />
            <Plus size={18} /><span>{images.busy ? 'Uploading' : 'Add images'}</span>
          </label>
        )
        : <p className="field__help">Save the {images.singular} once, then add images.</p>}
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.field schema field.
 * @param {*} props.value current form value.
 * @param {string} [props.error] fixed sentence to show under the field.
 * @param {(value: *) => void} props.onChange
 * @param {{onUpload: Function, onRemove: Function, busy: boolean, canUpload: boolean, singular: string}} [props.images] for image fields.
 */
export default function Field({ field, value, error, onChange, images }) {
  const id = useId();
  const count = (field.kind === 'text' || field.kind === 'textarea' || field.kind === 'url') && field.max ? `${String(value || '').length}/${field.max}` : null;
  let control;
  switch (field.kind) {
    case 'textarea': control = <textarea id={id} rows={field.rows || 4} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />; break;
    case 'number': control = <input id={id} type="number" inputMode="numeric" value={value} min={field.min} max={field.max} step={field.integer ? 1 : 'any'} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} aria-invalid={!!error} />; break;
    case 'toggle': control = <button id={id} type="button" role="switch" aria-checked={!!value} className={`switch${value ? ' is-on' : ''}`} onClick={() => onChange(!value)}><i /></button>; break;
    case 'select': control = <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>{(field.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>; break;
    case 'tags': case 'urls': control = <ListInput field={field} value={value} onChange={onChange} inputId={id} />; break;
    case 'images': control = <ImagesInput field={field} value={value} images={images} inputId={id} />; break;
    default: control = <input id={id} type={field.kind === 'url' ? 'url' : 'text'} value={value} maxLength={field.max ? field.max + 20 : undefined} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />;
  }
  return (
    <div className={`field field--${field.kind}${error ? ' has-error' : ''}`}>
      <div className="field__row"><label htmlFor={id}>{field.label}{field.required ? <span aria-hidden="true"> *</span> : null}</label>{count && <span className="field__count">{count}</span>}</div>
      {control}
      {error ? <p className="field__error" role="alert">{error}</p> : field.help ? <p className="field__help">{field.help}</p> : null}
    </div>
  );
}
