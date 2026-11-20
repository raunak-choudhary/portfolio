// src/components/admin/AdminWelcome/AdminWelcome.js
//
// Entry into the admin area. The voyage renders at once, underneath, so its
// data loads while the Matrix entry plays on top; when the entry finishes it is
// removed and the dashboard is already there. Replaces the 2025 developer
// scene (owner decision 2026-11-10).
//
// `requireSecurityEnrollment` is passed through so a session without an
// authenticator sees only the Security chapter's request.

import React, { useEffect, useMemo, useState } from 'react';
import VoyagePage from '../Voyage/VoyagePage';
import MatrixEntry from './MatrixEntry';
import { useAuthContext } from '../../../contexts/AuthContext';
import { supabase } from '../../../services/supabaseClient';
import { resetDashboardReady } from './adminReadiness';

/** Counts shown on the entry; each is null until known and stays null on failure. */
const useEntryCounts = () => {
  const [counts, setCounts] = useState({ projects: null, unread: null });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [projects, unread] = await Promise.all([
        // GET with one row, not HEAD: browsers report body-less HEAD count
        // responses as aborted in the network panel. Unread is counted the way
        // the inbox and the Mission Control tile count it: not read, not spam.
        supabase.from('projects').select('id', { count: 'exact' }).eq('status', 'active').limit(1),
        supabase.from('contact_messages').select('id', { count: 'exact' }).neq('status', 'read').not('is_spam', 'is', true).limit(1),
      ]);
      if (cancelled) return;
      setCounts({
        projects: projects.error ? null : projects.count ?? null,
        unread: unread.error ? null : unread.count ?? null,
      });
    })();
    return () => { cancelled = true; };
  }, []);
  return counts;
};

const AdminWelcome = ({ requireSecurityEnrollment = false }) => {
  const { assurance } = useAuthContext();
  const [entryDone, setEntryDone] = useState(false);
  const counts = useEntryCounts();

  // Cleared while this component first renders, before any child effect runs.
  // As an effect it ran after the entry screen had subscribed (child effects
  // run first) and wiped that subscription, so the entry never heard the
  // dashboard report in and always waited out its full cap.
  useState(() => { resetDashboardReady(); return null; });

  const facts = useMemo(() => ({
    secondFactorPassed: assurance?.currentLevel === 'aal2',
    enrollmentPending: Boolean(requireSecurityEnrollment),
    projects: counts.projects,
    unread: counts.unread,
  }), [assurance?.currentLevel, requireSecurityEnrollment, counts.projects, counts.unread]);

  return (
    <>
      <div inert={!entryDone} aria-hidden={!entryDone}>
        <VoyagePage requireSecurityEnrollment={requireSecurityEnrollment} />
      </div>
      {!entryDone && <MatrixEntry facts={facts} onDone={() => setEntryDone(true)} />}
    </>
  );
};

export default AdminWelcome;
