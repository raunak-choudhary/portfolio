// src/components/admin/Voyage/RecordView.js
//
// The read side of the record dialog: a record rendered the way a person
// reads it, not as a disabled form (disabled inputs are grey, hard to read
// and cannot be selected or followed). Driven by the same schema as the form,
// so every manager gets it for free: images as a strip, tags as chips, links
// as links that open in a new tab, long text as paragraphs, toggles as Yes or
// No, select values by their label, and anything empty as a quiet "Not set".

import React from 'react';
import { ExternalLink } from 'lucide-react';
import { fieldsForGroup } from './managers/schemaModel';

/** Kinds that read better across the full width of the dialog. */
export const WIDE_KINDS = new Set(['textarea', 'tags', 'urls', 'images']);

const NotSet = () => <span className="record-view__unset">Not set</span>;

const isEmpty = (value) => value === null || value === undefined || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0);

/** Only http(s) links become anchors; anything else stays text so a stray `javascript:` value can never run. */
const safeHref = (url) => (/^https?:\/\//i.test(String(url).trim()) ? String(url).trim() : null);

function LinkOut({ url }) {
  const href = safeHref(url);
  if (!href) return <span>{url}</span>;
  return <a className="record-view__link" href={href} target="_blank" rel="noopener noreferrer"><span>{href.replace(/^https?:\/\//i, '')}</span><ExternalLink size={12} aria-hidden="true" /></a>;
}

/** The rendered value of one field. */
export function ReadValue({ field, value }) {
  if (field.kind === 'toggle') return <span>{value ? 'Yes' : 'No'}</span>;
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
                  <dd><ReadValue field={field} value={row[field.key]} /></dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
