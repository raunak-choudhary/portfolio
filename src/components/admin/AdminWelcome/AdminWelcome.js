// src/components/admin/AdminWelcome/AdminWelcome.js
//
// Entry into the admin area. The dashboard renders at once, underneath, so its
// data loads while the Matrix entry plays on top; when the entry finishes it is
// removed and the dashboard is already there. Replaces the 2025 developer
// scene (owner decision 2026-11-10).
//
// `requireSecurityEnrollment` is passed through so a session without an
// authenticator sees only the Security screen.

import React, { useEffect, useMemo, useState } from 'react';
import AdminDashboard from '../AdminDashboard/AdminDashboard';
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
        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('contact_messages').select('id', { count: 'exact', head: true }).eq('status', 'unread'),
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

/** @param {'classic'|'voyage'} [props.view] which dashboard the entry opens onto. */
const AdminWelcome = ({ requireSecurityEnrollment = false, view = 'classic' }) => {
  const { assurance } = useAuthContext();
  const [entryDone, setEntryDone] = useState(false);
  const counts = useEntryCounts();

  useEffect(() => { resetDashboardReady(); }, []);

  const facts = useMemo(() => ({
    secondFactorPassed: assurance?.currentLevel === 'aal2',
    enrollmentPending: Boolean(requireSecurityEnrollment),
    projects: counts.projects,
    unread: counts.unread,
  }), [assurance?.currentLevel, requireSecurityEnrollment, counts.projects, counts.unread]);

  return (
    <>
      <div inert={!entryDone} aria-hidden={!entryDone}>
        {view === 'voyage' ? <VoyagePage requireSecurityEnrollment={requireSecurityEnrollment} /> : <AdminDashboard requireSecurityEnrollment={requireSecurityEnrollment} />}
      </div>
      {!entryDone && <MatrixEntry facts={facts} onDone={() => setEntryDone(true)} />}
    </>
  );
};

export default AdminWelcome;
