// src/components/admin/Voyage/RecordView.js
//
// The read side of the record dialog: a record rendered the way a person
// reads it, not as a disabled form (disabled inputs are grey, hard to read
// and cannot be selected or followed). Driven by the same schema as the form,
// so every manager gets it for free: images as a strip, tags as chips, links
// as links that open in a new tab, long text as paragraphs, toggles as Yes or
// No, select values by their label, dates as "12 Nov 2026", files by name,
// pairs as a two-column list, and anything empty as a quiet "Not set".
// Every value wraps (`overflow-wrap: anywhere`) so a long URL or word never
// spills out of its column.

import React from 'react';
import { ExternalLink, FileText, Star } from 'lucide-react';
import { fieldsForGroup, fileNameFromUrl, isFileUrl, isIsoDate, toPairs } from './managers/schemaModel';

/** Kinds that read better across the full width of the dialog. */
export const WIDE_KINDS = new Set(['textarea', 'tags', 'urls', 'images', 'files', 'pairs']);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-18" as "18 Nov 2026", read from the parts so no time zone can move it a day. */
export const readableDate = (iso) => { const v = String(iso).slice(0, 10); if (!isIsoDate(v)) return String(iso); const [y, m, d] = v.split('-'); return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`; };

const NotSet = () => <span className="record-view__unset">Not set</span>;

const isEmpty = (value) => value === null || value === undefined || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0);

/** Only http(s) links become anchors; anything else stays text so a stray `javascript:` value can never run. */
const safeHref = (url) => (/^https?:\/\//i.test(String(url).trim()) ? String(url).trim() : null);

function FileOut({ url }) {
  const href = safeHref(url);
  const name = fileNameFromUrl(url);
  return href
    ? <a className="record-view__link" href={href} target="_blank" rel="noopener noreferrer"><FileText size={13} aria-hidden="true" /><span>{name}</span><ExternalLink size={12} aria-hidden="true" /></a>
    : <span>{name}</span>;
}

function LinkOut({ url }) {
  const href = safeHref(url);
  if (!href) return <span>{url}</span>;
  return <a className="record-view__link" href={href} target="_blank" rel="noopener noreferrer"><span>{href.replace(/^https?:\/\//i, '')}</span><ExternalLink size={12} aria-hidden="true" /></a>;
}

/** The rendered value of one field. */
export function ReadValue({ field, value }) {
  if (field.kind === 'toggle') return <span>{value ? 'Yes' : 'No'}</span>;
  if (field.kind === 'pairs') {
    const pairs = toPairs(value);
    if (!pairs.length) return <NotSet />;
    return <dl className="record-view__pairs">{pairs.map((p, i) => <div key={`${p.key}-${i}`}><dt>{p.key}</dt><dd>{p.value}</dd></div>)}</dl>;
  }
  if (isEmpty(value)) return <NotSet />;
  switch (field.kind) {
    case 'textarea':
      return <div className="record-view__prose">{String(value).split(/\n+/).filter((p) => p.trim()).map((p, i) => <p key={i}>{p}</p>)}</div>;
    case 'tags':
      return <ul className="record-view__chips">{value.map((t, i) => <li key={`${t}-${i}`}>{t}</li>)}</ul>;
    case 'urls':
      return <ul className="record-view__links">{value.map((u, i) => <li key={`${u}-${i}`}><LinkOut url={u} /></li>)}</ul>;
    case 'url':
      return <LinkOut url={value} />;
    case 'select': {
      const option = (field.options || []).find((o) => o.value === value);
      return <span>{option ? option.label : String(value)}</span>;
    }
    case 'images':
      return <ImageStrip urls={value} />;
    case 'image': {
      const href = safeHref(value);
      return href ? <a className="record-view__image" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${field.label.toLowerCase()} in a new tab`}><img src={href} alt="" loading="lazy" /></a> : <span>{String(value)}</span>;
    }
    case 'file':
      return <FileOut url={value} />;
    case 'files': {
      const files = value.filter(isFileUrl), texts = value.filter((v) => !isFileUrl(v));
      return (
        <div className="record-view__files">
          {texts.length ? <ul className="record-view__chips">{texts.map((t, i) => <li key={`${t}-${i}`}>{t}</li>)}</ul> : null}
          {files.length ? <ul className="record-view__links">{files.map((u, i) => <li key={`${u}-${i}`}><FileOut url={u} /></li>)}</ul> : null}
        </div>
      );
    }
    case 'link':
      return /^https?:\/\//i.test(String(value)) ? <LinkOut url={value} /> : <code className="record-view__code">{String(value)}</code>;
    case 'date':
      return <span>{readableDate(value)}</span>;
    case 'rating': {
      const max = field.max || 5;
      return <span className="record-view__rating" aria-label={`${value} of ${max}`}>{Array.from({ length: max }, (_, i) => <Star key={i} size={14} aria-hidden="true" className={i < value ? 'is-on' : ''} />)}<span aria-hidden="true">{value}/{max}</span></span>;
    }
    default:
      return <span>{String(value)}</span>;
  }
}

function ImageStrip({ urls }) {
  return (
    <ul className="record-view__strip">
      {urls.map((url, i) => {
        const href = safeHref(url);
        return <li key={url}>{href ? <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open image ${i + 1} of ${urls.length} in a new tab`}><img src={href} alt="" loading="lazy" /></a> : null}</li>;
      })}
    </ul>
  );
}

/**
 * @param {object} props
 * @param {object} props.schema
 * @param {object} props.row the saved record.
 */
export default function RecordView({ schema, row }) {
  const imageField = schema.fields.find((f) => f.kind === 'images');
  const images = imageField && Array.isArray(row[imageField.key]) ? row[imageField.key] : [];
  // the title already heads the dialog and the images open the view, so neither repeats in the groups
  const skip = new Set([schema.titleKey, imageField?.key].filter(Boolean));
  const groups = schema.groups || [{ label: '', keys: schema.fields.map((f) => f.key) }];
  return (
    <div className="record-view" data-testid="record-view">
      {imageField && (images.length ? <ImageStrip urls={images} /> : <p className="record-view__noimages">No images yet. Edit to add some.</p>)}
      {groups.map((group, gi) => {
        const fields = fieldsForGroup(schema, group, gi).filter((f) => !skip.has(f.key));
        if (!fields.length) return null;
        return (
          <section key={group.label || gi} className="record-view__group" aria-label={group.label || undefined}>
            {group.label && <h4 className="record-view__heading">{group.label}</h4>}
            <dl className="record-view__list">
              {fields.map((field) => (
                <div key={field.key} className={`record-view__item${WIDE_KINDS.has(field.kind) ? ' is-wide' : ''}`}>
                  <dt>{field.label}</dt>
                  <dd><ReadValue field={field} value={field.kind === 'derived' && (row[field.key] === undefined || row[field.key] === null) ? field.compute(row) : row[field.key]} /></dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
