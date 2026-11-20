// src/components/admin/Voyage/Field.js
//
// One form field of the record dialog, rendered by its schema kind. Quiet by
// design: plain labelled inputs on glass, a counter where a limit exists,
// the error sentence under the field, nothing animated. Lists (tags, links)
// are chips with an input that adds on Enter; images are thumbnails with a
// remove button, a file picker and a per-file problem list; single images
// and files show what is stored with Replace and Remove; pairs are rows of
// label and value (the value grows to show all of its text) with move buttons.
//
// File controls take two flags from the dialog: `busy` (this field's own
// request is running, shown as "Uploading") and `locked` (another request
// owns the dialog: a Save, or another field's upload). Either one disables
// the picker and the remove buttons, so a file action can never start beside
// a Save. In a mixed list (`allowText`) only a file this field stored
// (`upload.owns`) is removed through storage; a typed entry, even a typed
// web address, is an ordinary unsaved form edit.
//
// Accessibility: the control carries aria-invalid and aria-describedby
// pointing at the error (or the help line), and the error starts with an
// icon and reads as a full sentence, so it never relies on colour alone.
// Controls that are groups of buttons (rating, pairs, uploads) are wrapped
// in an element with role="group" labelled by the field's label.
// `data-field` lets the dialog focus the first invalid field after Save.

import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, ExternalLink, FileText, Plus, Star, Upload, X } from 'lucide-react';
import { COUNTED_KINDS, addListItem, fileNameFromUrl, isDisabledBy, isFileUrl, moveItem, todayIso } from './managers/schemaModel';

const safeHref = (url) => (/^https?:\/\//i.test(String(url ?? '').trim()) ? String(url).trim() : null);

function ListInput({ field, value, onChange, inputId, a11y }) {
  const [draft, setDraft] = useState('');
  const add = () => { const next = addListItem(value, draft); if (next !== value) onChange(next); setDraft(''); };
  const listId = field.suggestions?.length ? `${inputId}-suggestions` : undefined;
  const full = field.max && value.length >= field.max;
  return (
    <div className="chips">
      {field.editable
        ? value.map((item, i) => (
          // editable lists keep one input per entry so a typo is fixed in place, not removed and retyped
          <span key={i} className="chip chip--edit">
            <input type="text" value={item} aria-label={`${field.label} ${i + 1}`} maxLength={field.itemMax ? field.itemMax + 20 : undefined} onChange={(e) => onChange(value.map((v, k) => (k === i ? e.target.value : v)))} />
            <button type="button" className="chip__remove" aria-label={`Remove ${field.label.toLowerCase()} ${i + 1}`} onClick={() => onChange(value.filter((_, k) => k !== i))}><X size={12} /></button>
          </span>
        ))
        : value.map((item, i) => (
          <span key={`${item}-${i}`} className="chip">
            <span className="chip__text">{item}</span>
            <button type="button" className="chip__remove" aria-label={`Remove ${item}`} onClick={() => onChange(value.filter((_, k) => k !== i))}><X size={12} /></button>
          </span>
        ))}
      {!full && (
        <div className="chips__add">
          <input id={inputId} type={field.kind === 'urls' ? 'url' : 'text'} value={draft} list={listId} placeholder={field.kind === 'urls' ? 'https://' : 'Add and press Enter'} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} {...a11y} />
          <button type="button" className="voyage-bar__button voyage-bar__button--small" onClick={add} aria-label={`Add to ${field.label}`}><Plus size={14} /><span>Add</span></button>
          {listId && <datalist id={listId}>{field.suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
        </div>
      )}
    </div>
  );
}

function Problems({ id, problems }) {
  if (!problems?.length) return null;
  return (
    <ul id={id} className="field__problems" role="alert">
      {problems.map((p, i) => <li key={`${p.name}-${i}`}><AlertCircle size={13} aria-hidden="true" /><span>{p.name ? <><b>{p.name}</b> {p.message}</> : p.message}</span></li>)}
    </ul>
  );
}

function ImagesInput({ value, images, inputId, problemsId }) {
  return (
    <>
      <div className="thumbs">
        {value.map((url) => (
          <figure key={url} className="thumb">
            <img src={url} alt="" loading="lazy" />
            <button type="button" className="thumb__remove" aria-label="Remove image" onClick={() => images.onRemove(url)} disabled={images.busy || images.locked}><X size={12} /></button>
          </figure>
        ))}
        {images.canUpload
          ? (
            <label className={`thumb thumb--add${images.busy ? ' is-busy' : ''}`}>
              <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={images.busy || images.locked} aria-describedby={images.problems?.length ? problemsId : undefined} onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) images.onUpload(files); }} />
              <Plus size={18} /><span>{images.busy ? 'Uploading' : 'Add images'}</span>
            </label>
          )
          : <p className="field__help">Save the {images.singular} once, then add images.</p>}
      </div>
      <Problems id={problemsId} problems={images.problems} />
    </>
  );
}

/** The file picker every upload kind shares: a real input inside a button-styled label. */
function Picker({ inputId, upload, multiple, label, describedBy }) {
  return (
    <label className={`voyage-bar__button voyage-bar__button--small picker${upload.busy ? ' is-busy' : ''}`}>
      <input id={inputId} type="file" accept={upload.accept.join(',')} multiple={multiple} disabled={upload.busy || upload.locked} aria-describedby={describedBy} onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) upload.onUpload(files); }} />
      <Upload size={14} aria-hidden="true" /><span>{upload.busy ? 'Uploading' : label}</span>
    </label>
  );
}

function FileLink({ url }) {
  const href = safeHref(url);
  const name = fileNameFromUrl(url);
  return href
    ? <a className="file-link" href={href} target="_blank" rel="noopener noreferrer"><FileText size={14} aria-hidden="true" /><span>{name}</span><ExternalLink size={12} aria-hidden="true" /></a>
    : <span className="file-link"><FileText size={14} aria-hidden="true" /><span>{name}</span></span>;
}

function SingleUpload({ field, value, upload, inputId, problemsId, labelId }) {
  const isImage = field.kind === 'image';
  const later = <p className="field__help">Save the {upload.singular} once, then add {isImage ? 'an image' : 'a file'}.</p>;
  return (
    <div className="upload" role="group" aria-labelledby={labelId}>
      {value
        ? (
          <div className={`upload__current${isImage ? ' upload__current--image' : ''}`}>
            {isImage ? <img src={value} alt="" loading="lazy" /> : <FileLink url={value} />}
            <div className="upload__actions">
              {upload.canUpload && <Picker inputId={inputId} upload={upload} label="Replace" describedBy={upload.problems?.length ? problemsId : undefined} />}
              <button type="button" className="voyage-bar__button voyage-bar__button--small" onClick={() => upload.onRemove(value)} disabled={upload.busy || upload.locked || !upload.canUpload}><X size={14} /><span>Remove</span></button>
            </div>
          </div>
        )
        : upload.canUpload ? <Picker inputId={inputId} upload={upload} label={isImage ? 'Choose an image' : 'Choose a file'} describedBy={upload.problems?.length ? problemsId : undefined} /> : later}
      <Problems id={problemsId} problems={upload.problems} />
    </div>
  );
}

function FilesInput({ field, value, onChange, upload, inputId, problemsId, labelId }) {
  const [draft, setDraft] = useState('');
  const full = field.max && value.length >= field.max;
  const addText = () => { const next = addListItem(value, draft); if (next !== value) onChange(next); setDraft(''); };
  // A stored file leaves through storage; anything typed (a name, or a web address someone pasted) is
  // only in the form and is removed there. Without `owns` every web address counts as stored, as before.
  const isStored = (entry) => isFileUrl(entry) && (upload.owns ? upload.owns(entry) : true);
  return (
    <div className="upload" role="group" aria-labelledby={labelId}>
      {value.length ? (
        <ul className="file-list">
          {value.map((entry, i) => (
            <li key={`${entry}-${i}`}>
              {isFileUrl(entry) ? <FileLink url={entry} /> : <span className="file-list__text">{entry}</span>}
              <button type="button" className="chip__remove" aria-label={`Remove ${isFileUrl(entry) ? fileNameFromUrl(entry) : entry}`} onClick={() => (isStored(entry) ? upload.onRemove(entry) : onChange(value.filter((_, k) => k !== i)))} disabled={upload.busy || (isStored(entry) && (upload.locked || !upload.canUpload))}><X size={12} /></button>
            </li>
          ))}
        </ul>
      ) : null}
      {!full && (
        <div className="upload__actions">
          {upload.canUpload ? <Picker inputId={field.allowText ? `${inputId}-files` : inputId} upload={upload} multiple label="Add files" describedBy={upload.problems?.length ? problemsId : undefined} /> : <p className="field__help">Save the {upload.singular} once, then add files.</p>}
        </div>
      )}
      {field.allowText && !full && (
        <div className="chips__add">
          <input id={inputId} type="text" value={draft} placeholder="Or type a name and press Enter" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addText(); } }} />
          <button type="button" className="voyage-bar__button voyage-bar__button--small" onClick={addText} aria-label={`Add text to ${field.label}`}><Plus size={14} /><span>Add</span></button>
        </div>
      )}
      <Problems id={problemsId} problems={upload.problems} />
    </div>
  );
}

/** Sets a textarea's height to its content (height auto first, so it can also shrink). */
const fitHeight = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; };

/**
 * A one-line value that grows to show everything typed: a pair's value can
 * run to 200 characters (About "availability"), which an input would cut off
 * at the right edge. Enter does not start a new line because the public page
 * shows each value on one line; pasted line breaks become spaces.
 */
export function GrowingText({ value, onChange, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => { fitHeight(ref.current); }, [value]);
  // a narrower column wraps the same text onto more lines, so refit on resize too
  useLayoutEffect(() => {
    const el = ref.current;
    if (typeof ResizeObserver === 'undefined' || !el) return undefined;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => { if (el.clientWidth !== width) { width = el.clientWidth; fitHeight(el); } });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <textarea ref={ref} rows={1} value={value} onChange={(e) => onChange(e.target.value.replace(/\s*\n+\s*/g, ' '))} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} {...rest} />;
}

function PairsInput({ field, value, onChange, inputId, labelId, a11y }) {
  const update = (i, part, text) => onChange(value.map((p, k) => (k === i ? { ...p, [part]: text } : p)));
  const full = field.max && value.length >= field.max;
  return (
    <div className="pairs" role="group" aria-labelledby={labelId} aria-describedby={a11y['aria-describedby']}>
      {value.length ? (
        <ol className="pairs__list">
          {value.map((p, i) => (
            <li key={i} className="pairs__row">
              <input id={i === 0 ? inputId : undefined} type="text" className="pairs__key" value={p.key} placeholder="Label" aria-label={`Label ${i + 1}`} aria-invalid={a11y['aria-invalid']} maxLength={field.keyMax ? field.keyMax + 20 : undefined} onChange={(e) => update(i, 'key', e.target.value)} />
              <GrowingText className="pairs__value" value={p.value} placeholder="Value" aria-label={`Value ${i + 1}`} aria-invalid={a11y['aria-invalid']} maxLength={field.valueMax ? field.valueMax + 20 : undefined} onChange={(text) => update(i, 'value', text)} />
              <span className="pairs__tools">
                <button type="button" className="pairs__tool" aria-label={`Move row ${i + 1} up`} disabled={i === 0} onClick={() => onChange(moveItem(value, i, -1))}><ArrowUp size={14} /></button>
                <button type="button" className="pairs__tool" aria-label={`Move row ${i + 1} down`} disabled={i === value.length - 1} onClick={() => onChange(moveItem(value, i, 1))}><ArrowDown size={14} /></button>
                <button type="button" className="pairs__tool" aria-label={`Remove row ${i + 1}`} onClick={() => onChange(value.filter((_, k) => k !== i))}><X size={14} /></button>
              </span>
            </li>
          ))}
        </ol>
      ) : <p className="field__help">No rows yet.</p>}
      {!full && <button type="button" id={value.length ? undefined : inputId} className="voyage-bar__button voyage-bar__button--small" onClick={() => onChange([...value, { key: '', value: '' }])}><Plus size={14} /><span>Add row</span></button>}
    </div>
  );
}

function RatingInput({ field, value, onChange, inputId, labelId, a11y }) {
  const max = field.max || 5;
  return (
    <div id={inputId} className="rating" role="radiogroup" aria-labelledby={labelId} aria-describedby={a11y['aria-describedby']} aria-invalid={a11y['aria-invalid']}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} of ${max}`} className={`rating__star${value !== '' && n <= value ? ' is-on' : ''}`} onClick={() => onChange(n)}><Star size={18} /></button>
      ))}
      {value !== '' && <button type="button" className="voyage-bar__button voyage-bar__button--small" onClick={() => onChange('')}><span>Clear</span></button>}
    </div>
  );
}

/** The counter beside the label: characters for text, entries for lists. */
function counterFor(field, value) {
  if (COUNTED_KINDS.has(field.kind) && field.max) return `${String(value || '').length}/${field.max}`;
  if ((field.kind === 'tags' || field.kind === 'urls' || field.kind === 'files' || field.kind === 'pairs') && field.max) return `${Array.isArray(value) ? value.length : 0}/${field.max} items`;
  return null;
}

/**
 * @param {object} props
 * @param {object} props.field schema field.
 * @param {*} props.value current form value.
 * @param {object} [props.form] the whole form, for fields that depend on another (a disabled end date, a derived value).
 * @param {string} [props.error] fixed sentence to show under the field (already filtered by the dialog's timing rules).
 * @param {(value: *) => void} props.onChange
 * @param {() => void} [props.onLeave] called when focus leaves the whole field (not on moves inside it, such as chip to input).
 * @param {{onUpload: Function, onRemove: Function, busy: boolean, locked?: boolean, canUpload: boolean, singular: string, problems?: Array}} [props.images] for the images kind.
 * @param {{onUpload: Function, onRemove: Function, busy: boolean, locked?: boolean, canUpload: boolean, singular: string, accept: string[], owns?: (url: string) => boolean, problems?: Array}} [props.upload] for image, file and files.
 */
export default function Field({ field, value, form, error, onChange, onLeave, images, upload }) {
  const id = useId();
  const errorId = `${id}-error`, helpId = `${id}-help`, labelId = `${id}-label`, problemsId = `${id}-problems`;
  const disabled = isDisabledBy(field, form);
  const help = disabled && field.disabledHelp ? field.disabledHelp : field.help;
  const count = counterFor(field, value);
  const a11y = { 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? errorId : help ? helpId : undefined };
  let control;
  switch (field.kind) {
    case 'textarea': control = <textarea id={id} rows={field.rows || 4} value={value} onChange={(e) => onChange(e.target.value)} {...a11y} />; break;
    case 'number': control = <input id={id} type="number" inputMode="numeric" value={value} min={field.min} max={field.max} step={field.integer ? 1 : 'any'} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} {...a11y} />; break;
    case 'numeric': control = <input id={id} type="text" inputMode="decimal" value={value} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} {...a11y} />; break;
    case 'rating': control = <RatingInput field={field} value={value} onChange={onChange} inputId={id} labelId={labelId} a11y={a11y} />; break;
    case 'toggle': control = <button id={id} type="button" role="switch" aria-checked={!!value} className={`switch${value ? ' is-on' : ''}`} onClick={() => onChange(!value)} aria-describedby={a11y['aria-describedby']}><i /></button>; break;
    case 'date': control = <input id={id} type="date" value={disabled ? '' : value} disabled={disabled} min={field.min === 'today' ? todayIso() : field.min} max={field.max === 'today' ? todayIso() : field.max} onChange={(e) => onChange(e.target.value)} {...a11y} />; break;
    case 'select': {
      const known = (field.options || []).some((o) => o.value === value);
      control = (
        <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...a11y}>
          {field.allowEmpty && <option value="">{field.emptyLabel || 'Not set'}</option>}
          {/* a stored value the list does not know stays selectable, so opening the form never changes it */}
          {!known && value ? <option value={value}>{value} (not in the list)</option> : null}
          {(field.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
      break;
    }
    case 'tags': case 'urls': control = <ListInput field={field} value={value} onChange={onChange} inputId={id} a11y={a11y} />; break;
    case 'images': control = <ImagesInput value={value} images={images} inputId={id} problemsId={problemsId} />; break;
    case 'image': case 'file': control = <SingleUpload field={field} value={value} upload={upload} inputId={id} problemsId={problemsId} labelId={labelId} />; break;
    case 'files': control = <FilesInput field={field} value={value} onChange={onChange} upload={upload} inputId={id} problemsId={problemsId} labelId={labelId} />; break;
    case 'pairs': control = <PairsInput field={field} value={value} onChange={onChange} inputId={id} labelId={labelId} a11y={a11y} />; break;
    case 'derived': control = <output id={id} className="field__derived" aria-describedby={a11y['aria-describedby']}>{String(field.compute(form || {}))}</output>; break;
    default: control = <input id={id} type={field.kind === 'url' ? 'url' : 'text'} value={value} placeholder={field.placeholder} maxLength={field.max ? field.max + 20 : undefined} onChange={(e) => onChange(e.target.value)} {...a11y} />;
  }
  // focusout bubbles in React; ignore moves between parts of the same field
  const onBlur = onLeave ? (e) => { if (!e.currentTarget.contains(e.relatedTarget)) onLeave(); } : undefined;
  return (
    <div className={`field field--${field.kind}${error ? ' has-error' : ''}${disabled ? ' is-disabled' : ''}`} data-field={field.key} onBlur={onBlur}>
      <div className="field__row"><label id={labelId} htmlFor={id}>{field.label}{field.required ? <span aria-hidden="true"> *</span> : null}</label>{count && <span className="field__count">{count}</span>}</div>
      {control}
      {error
        ? <p id={errorId} className="field__error"><AlertCircle size={13} aria-hidden="true" /><span>{error}</span></p>
        : help ? <p id={helpId} className="field__help">{help}</p> : null}
    </div>
  );
}
