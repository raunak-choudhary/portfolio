// src/components/admin/Voyage/chapters.js
//
// The voyage's chapter registry: a prologue in low Earth orbit and sixteen
// stops along the route, one constellation each, in a fixed order the owner
// can learn. The twelve content managers sit on the twelve zodiac signs in
// calendar order; the famous figures hold the other four. Everything else in
// the voyage (stages, the star rail, the palette, the 3D field) is built from
// this list.

/** @typedef {'prologue'|'bento'|'deck'|'charts'|'inbox'|'security'} ChapterKind */

/**
 * @type {ReadonlyArray<{id: string, name: string, constellation: string|null, place?: string, rail?: string, kind: ChapterKind, table?: string, sub: string}>}
 * `table` names the Supabase table a deck chapter manages (the health rules and the
 * stats use the same names), `sub` is the one-line description under the title.
 * The prologue has no constellation; `place` names where it is and `rail` is its mark on the rail.
 */
export const CHAPTERS = Object.freeze([
  { id: 'earth', name: 'Earth', constellation: null, place: 'Low Earth orbit', rail: '⊕', kind: 'prologue', sub: 'Scroll to travel through your portfolio, one constellation per section.' },
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

/** The place name shown for a chapter: its constellation's full name when known, else the abbreviation, else the prologue's place. */
export const chapterPlace = (chapter, names = {}) => (chapter.constellation ? names[chapter.constellation] || chapter.constellation : chapter.place || '');

/**
 * Deep-sky photographs placed far behind the route: which one appears near
 * which chapter and on which side. They sit well beyond the constellations
 * (depth is added to the chapter anchor's z) and are drawn large, so they
 * read as the coloured background of the same sky the stars hang in, moving
 * slowly with parallax, never as a layer pasted on top. Eight only: each one
 * is meant to be noticed.
 */
export const DEEP_SKY_PLACEMENTS = Object.freeze([
  { slug: 'andromeda', near: 'overview', side: 'left', scale: 1.6, depth: -2200 },
  { slug: 'whirlpool', near: 'about', side: 'right', scale: 1.0, depth: -1800 },
  { slug: 'pillars', near: 'projects', side: 'left', scale: 1.4, depth: -2000 },
  { slug: 'cosmic-cliffs', near: 'work', side: 'right', scale: 1.6, depth: -2300 },
  { slug: 'crab', near: 'leadership', side: 'left', scale: 1.0, depth: -1700 },
  { slug: 'orion', near: 'media', side: 'right', scale: 1.4, depth: -2100 },
  { slug: 'pinwheel', near: 'analytics', side: 'left', scale: 1.1, depth: -1900 },
  { slug: 'ring', near: 'inbox', side: 'right', scale: 0.8, depth: -1600 },
]);
