// src/components/admin/Voyage/chapters.js
//
// The voyage's chapter registry: sixteen stops along the route, one
// constellation each, in a fixed order the owner can learn. The twelve content
// managers sit on the twelve zodiac signs in calendar order; the famous
// figures hold the other four. Everything else in the voyage (stages, the
// star rail, the palette, the 3D field) is built from this list.

/** @typedef {'bento'|'deck'|'charts'|'inbox'|'security'} ChapterKind */

/**
 * @type {ReadonlyArray<{id: string, name: string, constellation: string, kind: ChapterKind, table?: string, sub: string}>}
 * `table` names the Supabase table a deck chapter manages (the health rules and the
 * stats use the same names), `sub` is the one-line description under the title.
 */
export const CHAPTERS = Object.freeze([
  { id: 'overview', name: 'Mission control', constellation: 'UMa', kind: 'bento', sub: 'Health, fixes and what happened lately.' },
  { id: 'hero', name: 'Hero', constellation: 'Ari', kind: 'deck', table: 'hero_content', sub: 'The first screen visitors see.' },
  { id: 'about', name: 'About', constellation: 'Tau', kind: 'deck', table: 'about_content', sub: 'Who you are, in your words.' },
  { id: 'projects', name: 'Projects', constellation: 'Gem', kind: 'deck', table: 'projects', sub: 'What you built, newest first.' },
  { id: 'internships', name: 'Internships', constellation: 'Cnc', kind: 'deck', table: 'internships', sub: 'Where you trained.' },
  { id: 'education', name: 'Education', constellation: 'Leo', kind: 'deck', table: 'education', sub: 'Degrees and schools.' },
  { id: 'work', name: 'Work experience', constellation: 'Vir', kind: 'deck', table: 'work_experience', sub: 'Roles and what they taught you.' },
  { id: 'skills', name: 'Skills', constellation: 'Lib', kind: 'deck', table: 'skills', sub: 'Tools and languages, in groups.' },
  { id: 'certifications', name: 'Certifications', constellation: 'Sco', kind: 'deck', table: 'certifications', sub: 'Certificates with proof links.' },
  { id: 'recommendations', name: 'Recommendations', constellation: 'Sgr', kind: 'deck', table: 'recommendations', sub: 'What others say about you.' },
  { id: 'achievements', name: 'Achievements', constellation: 'Cap', kind: 'deck', table: 'achievements', sub: 'Awards and recognitions.' },
  { id: 'leadership', name: 'Leadership', constellation: 'Aqr', kind: 'deck', table: 'leadership', sub: 'Teams you led and roles you held.' },
  { id: 'media', name: 'Media library', constellation: 'Psc', kind: 'deck', table: null, sub: 'Images and files behind the sections.' },
  { id: 'analytics', name: 'Analytics', constellation: 'Ori', kind: 'charts', sub: 'Visitors, pages and sources, last 30 days.' },
  { id: 'inbox', name: 'Inbox', constellation: 'Cyg', kind: 'inbox', table: 'contact_messages', sub: 'Messages from the contact form.' },
  { id: 'security', name: 'Security', constellation: 'Cas', kind: 'security', sub: 'Authenticators, sessions, recovery.' },
]);

export const CHAPTER_IDS = CHAPTERS.map((c) => c.id);

/** Chapter by id, or undefined. */
export const chapterById = (id) => CHAPTERS.find((c) => c.id === id);

/** Index of a chapter id, or -1. */
export const chapterIndex = (id) => CHAPTER_IDS.indexOf(id);

/** Deep-sky objects placed along the route: which photograph appears near which chapter, and on which side. */
export const DEEP_SKY_PLACEMENTS = Object.freeze([
  { slug: 'andromeda', near: 'overview', side: 'left', scale: 1.7, depth: -700 },
  { slug: 'whirlpool', near: 'about', side: 'right', scale: 1.1, depth: -420 },
  { slug: 'pillars', near: 'projects', side: 'left', scale: 1.5, depth: -560 },
  { slug: 'sombrero', near: 'education', side: 'right', scale: 1.0, depth: -380 },
  { slug: 'cosmic-cliffs', near: 'work', side: 'left', scale: 1.6, depth: -640 },
  { slug: 'helix', near: 'certifications', side: 'right', scale: 1.0, depth: -420 },
  { slug: 'antennae', near: 'recommendations', side: 'left', scale: 1.2, depth: -500 },
  { slug: 'crab', near: 'leadership', side: 'right', scale: 1.1, depth: -440 },
  { slug: 'orion', near: 'media', side: 'left', scale: 1.4, depth: -600 },
  { slug: 'pinwheel', near: 'analytics', side: 'right', scale: 1.2, depth: -480 },
  { slug: 'ring', near: 'inbox', side: 'left', scale: 0.9, depth: -360 },
  { slug: 'ngc1300', near: 'security', side: 'right', scale: 1.1, depth: -460 },
]);

/** The procedural black hole waits off the route near this chapter, on this side. */
export const BLACK_HOLE_PLACEMENT = Object.freeze({ near: 'skills', side: 'right', scale: 1.0, depth: -900 });
