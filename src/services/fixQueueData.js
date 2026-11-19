// src/services/fixQueueData.js
//
// Everything the fix queue reads, in one load: every row of each table the
// health rules check, the dismissals ("Not needed"), and each section's last
// edit for the stale list. A table that fails to load is reported as null,
// never as empty, so the queue can say it could not check that section. When
// the dismissals table does not exist yet (the migration has not been run)
// the queue still works; it just cannot mark anything as not needed.

import { getAdminSupabaseClient } from './adminDataService';
import { SECTION_HEALTH_RULES } from './analyticsService';
import { listDismissals } from './fixDismissalsService';
import { EDITED_TABLES, getSectionFreshness } from './voyageData';

/**
 * @returns {Promise<{rowsByTable: Object<string, Array<object>|null>, dismissals: Array<object>, dismissalsAvailable: boolean, freshness: Array<{table: string, section: string, at: string|null}>}>}
 */
export async function loadFixQueueData() {
  const client = getAdminSupabaseClient();
  const [entries, dismissalResult, freshness] = await Promise.all([
    Promise.all(SECTION_HEALTH_RULES.map(async (rule) => {
      try {
        const { data, error } = await client.from(rule.table).select('*');
        return [rule.table, error || !Array.isArray(data) ? null : data];
      } catch { return [rule.table, null]; }
    })),
    listDismissals().then((rows) => ({ rows, available: true }), () => ({ rows: [], available: false })),
    getSectionFreshness().catch(() => []),
  ]);
  const tableBySection = Object.fromEntries(EDITED_TABLES.map(([table, section]) => [section, table]));
  const ruleName = Object.fromEntries(SECTION_HEALTH_RULES.map((r) => [r.table, r.name]));
  return {
    rowsByTable: Object.fromEntries(entries),
    dismissals: dismissalResult.rows,
    dismissalsAvailable: dismissalResult.available,
    freshness: (freshness || []).map((f) => ({ ...f, table: tableBySection[f.section] || null, section: ruleName[tableBySection[f.section]] || f.section })).filter((f) => f.table),
  };
}
