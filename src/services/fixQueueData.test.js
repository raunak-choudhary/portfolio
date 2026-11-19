import { loadFixQueueData } from './fixQueueData';
import { listDismissals } from './fixDismissalsService';
import { getSectionFreshness } from './voyageData';
import { getAdminSupabaseClient } from './adminDataService';

jest.mock('./supabaseClient', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('./adminDataService', () => ({ getAdminSupabaseClient: jest.fn(), describeAdminWriteError: jest.fn() }));
jest.mock('./fixDismissalsService', () => ({ listDismissals: jest.fn() }));
jest.mock('./voyageData', () => ({
  EDITED_TABLES: [['projects', 'Projects', 'title'], ['work_experience', 'Work', 'company']],
  getSectionFreshness: jest.fn(),
}));

/** A client whose every table answers with rows, except the ones named as failing. */
const clientWith = (failing = []) => ({
  from: (table) => ({ select: () => Promise.resolve(failing.includes(table) ? { data: null, error: { message: 'refused' } } : { data: [{ id: `${table}-1` }], error: null }) }),
});

describe('loadFixQueueData', () => {
  beforeEach(() => {
    getAdminSupabaseClient.mockReturnValue(clientWith(['skills']));
    listDismissals.mockResolvedValue([{ id: 'd1', ruleKey: 'projects:images', recordId: null }]);
    getSectionFreshness.mockResolvedValue([{ section: 'Work', at: '2026-01-01T00:00:00Z' }, { section: 'Projects', at: null }, { section: 'Elsewhere', at: '2026-01-01' }]);
  });

  it('loads every rule table, marking a failed one as null', async () => {
    const out = await loadFixQueueData();
    expect(out.rowsByTable.projects).toEqual([{ id: 'projects-1' }]);
    expect(out.rowsByTable.skills).toBeNull();
    expect(Object.keys(out.rowsByTable)).toHaveLength(11);
  });

  it('passes dismissals through and maps freshness labels to tables and rule names', async () => {
    const out = await loadFixQueueData();
    expect(out.dismissalsAvailable).toBe(true);
    expect(out.dismissals).toHaveLength(1);
    expect(out.freshness).toEqual([{ section: 'Work Experience', table: 'work_experience', at: '2026-01-01T00:00:00Z' }, { section: 'Projects', table: 'projects', at: null }]);
  });

  it('keeps working when the dismissals table is missing', async () => {
    listDismissals.mockRejectedValue(new Error('relation does not exist'));
    getSectionFreshness.mockRejectedValue(new Error('offline'));
    const out = await loadFixQueueData();
    expect(out).toMatchObject({ dismissals: [], dismissalsAvailable: false, freshness: [] });
  });
});
