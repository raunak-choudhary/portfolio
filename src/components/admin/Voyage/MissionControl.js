// src/components/admin/Voyage/MissionControl.js
//
// Mission Control (Ursa Major): the bento of tiles, then a split below it
// with the fix queue on the left (7fr) and the activity log on the right
// (5fr) from 1280 px, stacked on narrower screens. The fix queue arrives as
// the `fixQueue` slot from its own unit; until then the activity pane takes
// the whole row.
//
// The activity feed is loaded here once: the pane shows it in full and the
// Recent activity tile shows its newest rows (or, while the activity table
// is missing, the latest saves per section that the page already loads).
//
// The feed reloads quietly whenever Mission Control comes back into view
// (after a save, a delete or an inbox change in another chapter, the way
// back here is a scroll) and when the New York date changes (in the feed).
//
// Every row click goes through `openRecord(table, id)`. Today it travels to
// the record's chapter; the fix queue unit swaps it for an intent that also
// opens the record itself. Keep it the only way a row opens anything.

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import Bento from './Bento';
import ActivityPane, { ACTIVITY_PANE_ID, ACTIVITY_TITLE_ID, useActivityFeed } from './ActivityPane';
import { CHAPTERS } from './chapters';
import './Activity.css';

/** The chapter that manages a table, or undefined. */
export const chapterForTable = (table) => CHAPTERS.find((c) => c.table === table && c.kind === 'deck');

/**
 * @param {object} props
 * @param {object} props.data the page's tile data (health, visitors, inbox, edits, pages, stats, assetBase).
 * @param {(chapterId: string) => void} props.onGo scrolls to a chapter.
 * @param {boolean} [props.motion] smooth scrolling allowed (false under reduced motion).
 * @param {React.ReactNode} [props.fixQueue] the fix queue pane, filled by its own unit.
 * @param {Date} [props.now] the clock, for tests.
 */
export default function MissionControl({ data, onGo, motion = true, fixQueue = null, now }) {
  const feed = useActivityFeed();

  // The one way an activity row opens a record (see the header).
  // `id` is unused until the record itself can be opened by intent.
  const openRecord = useCallback((table, id) => {
    const chapter = chapterForTable(table);
    if (chapter) onGo(chapter.id);
  }, [onGo]);

  // Scrolls to the pane and puts focus on its heading, so keyboard and screen reader users land there too.
  const seeAllActivity = useCallback(() => {
    document.getElementById(ACTIVITY_PANE_ID)?.scrollIntoView({ behavior: motion ? 'smooth' : 'auto', block: 'start' });
    document.getElementById(ACTIVITY_TITLE_ID)?.focus({ preventScroll: true });
  }, [motion]);

  // Back in view after being away: reload quietly. No observer (old browsers, tests without one): no refresh.
  const rootRef = useRef(null);
  const { refresh } = feed;
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    let away = false;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      if (!entry.isIntersecting) away = true;
      else if (away) { away = false; refresh(); }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [refresh]);

  // Once the unfiltered log has loaded the tile keeps its rows, so switching the pane's filter never blanks it.
  const tileStatus = feed.latest ? 'ready' : feed.status;
  const tileData = useMemo(() => ({ ...data, activity: { status: tileStatus, rows: feed.latest || [] } }), [data, tileStatus, feed.latest]);

  return (
    <div className="mission" ref={rootRef}>
      <Bento data={tileData} onGo={onGo} onSeeActivity={seeAllActivity} now={now} />
      <div className={`v5-split${fixQueue ? '' : ' v5-split--single'}`} data-testid="mission-split">
        {fixQueue}
        <ActivityPane feed={feed} onOpen={openRecord} now={now} />
      </div>
    </div>
  );
}
