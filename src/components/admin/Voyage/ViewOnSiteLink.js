// src/components/admin/Voyage/ViewOnSiteLink.js
//
// The quiet "View on site" pill in a chapter heading. It opens the chapter's
// public page in a new tab, so the admin stays where it was while the owner
// checks an edit live. Chapters with no public page render nothing.

import React from 'react';
import { ExternalLink } from 'lucide-react';
import { publicPathFor } from './publicPages';

/**
 * @param {object} props
 * @param {{id: string, name: string}} props.chapter a chapter from the registry.
 */
export default function ViewOnSiteLink({ chapter }) {
  const href = publicPathFor(chapter.id);
  if (!href) return null;
  return (
    <a
      className="voyage-chapter__view"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`View ${chapter.name} on the live site (opens in a new tab)`}
    >
      <ExternalLink size={13} aria-hidden="true" />
      <span>View on site</span>
    </a>
  );
}
