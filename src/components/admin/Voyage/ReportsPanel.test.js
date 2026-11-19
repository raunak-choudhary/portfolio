// Tests for the Reports tab and the report dialog, against the shared
// reports service's { success, data } | { success: false, error } shape.
// The services are mocked; no request leaves the test.

import ReportsPanel, { LIST_FAILURE, reportLine, stampOf } from './ReportsPanel';
import { generateReport, listReports } from '../../../services/reportsService';
import { reportsTableMissing } from '../../../services/reportsTableProbe';
import { React, act, click, mount } from '../SkyBackground/testUtils';

jest.mock('../../../services/reportsService', () => ({
  REPORT_MESSAGES: { UNKNOWN: 'The report could not be made. Try again later.' },
  listReports: jest.fn(),
  generateReport: jest.fn(),
}));
jest.mock('../../../services/reportsTableProbe', () => ({ reportsTableMissing: jest.fn() }));

// 19 Nov 2026, 12:00 New York
const NOW = Date.parse('2026-11-19T17:00:00Z');
const flush = () => act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
const fail = (code, message = `fixed ${code}`) => ({ success: false, error: { code, message } });
const report = (over = {}) => ({
  id: 'r1', period_label: 'July to September 2026', quarter: 'Q3 2026', period_start: '2026-07-01', period_end: '2026-09-30',
  partial: false, trigger: 'schedule', email_status: 'sent', created_at: '2026-10-01T13:00:05Z',
  body_html: '<!doctype html><p>Report body</p><script>parent.x = 1</script>', body_text: 'Report body', summary: {}, ...over,
});

/** A button by its accessible name (aria-label, else text). */
const button = (name, root = document.body) => [...root.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.textContent.trim()) === name) || null;
const text = () => document.body.textContent;

let view, notify;
const renderPanel = async () => { view = mount(<ReportsPanel now={NOW} notify={notify} />); await flush(); };

beforeEach(() => {
  notify = jest.fn();
  reportsTableMissing.mockResolvedValue(false);
});
afterEach(() => { view?.unmount(); view = null; });

describe('formatting', () => {
  it('stamps in New York time', () => {
    expect(stampOf('2026-10-01T13:00:05Z')).toBe('1 Oct 2026, 9:00 AM');
    expect(stampOf('not a date')).toBe('');
  });

  it('describes how each report was made', () => {
    expect(reportLine(report())).toBe('Q3 2026 · sent 1 Oct 2026, 9:00 AM');
    expect(reportLine(report({ partial: true, trigger: 'manual', email_status: 'failed' }))).toBe('Q3 2026 · partial, generated 1 Oct 2026, 9:00 AM · email failed');
    expect(reportLine(report({ email_status: 'skipped' }))).toBe('Q3 2026 · sent 1 Oct 2026, 9:00 AM · not emailed');
  });
});

describe('the archive', () => {
  it('names the next run from today in New York and says when nothing is stored', async () => {
    listReports.mockResolvedValue({ success: true, data: [] });
    await renderPanel();
    expect(text()).toContain('1 Jan 2027 · 9:00 AM New York');
    expect(text()).toContain('No reports yet');
    expect(button('Generate now').disabled).toBe(false);
  });

  it('lists reports and opens one in a sandboxed frame inside the dialog', async () => {
    listReports.mockResolvedValue({ success: true, data: [report(), report({ id: 'r0', period_label: 'April to June 2026', quarter: 'Q2 2026' })] });
    await renderPanel();
    expect(view.container.querySelectorAll('.ins-reports li')).toHaveLength(2);
    click(button('Open the report for July to September 2026'));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog.querySelector('#report-dialog-title').textContent).toBe('July to September 2026');
    const frame = dialog.querySelector('iframe');
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain('<p>Report body</p>');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame.getAttribute('title')).toBe('Report for July to September 2026');
    expect(document.activeElement).toBe(dialog.querySelector('.record-dialog__close'));
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('marks a partial report in the title and falls back to the text body', async () => {
    listReports.mockResolvedValue({ success: true, data: [report({ partial: true, trigger: 'manual', body_html: '' })] });
    await renderPanel();
    click(button('Open the latest report'));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog.querySelector('#report-dialog-title').textContent).toBe('July to September 2026 (partial)');
    expect(dialog.querySelector('pre').textContent).toBe('Report body');
    expect(dialog.querySelector('iframe')).toBeNull();
  });

  it('says "not set up" only when the table is missing, and keeps Generate off', async () => {
    listReports.mockResolvedValue(fail('LOAD_FAILED'));
    reportsTableMissing.mockResolvedValue(true);
    await renderPanel();
    expect(text()).toContain('Not set up yet');
    expect(text()).toContain('Reports start after the report job is set up');
    expect(button('Generate now').disabled).toBe(true);
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows the archive error with Try again for any other load failure', async () => {
    listReports.mockResolvedValueOnce(fail('LOAD_FAILED')).mockResolvedValueOnce({ success: true, data: [report()] });
    await renderPanel();
    expect(document.querySelector('[role="alert"]').textContent).toContain(LIST_FAILURE.LOAD_FAILED);
    expect(reportsTableMissing).toHaveBeenCalledTimes(1);
    click(button('Try again'));
    await flush();
    expect(text()).toContain('July to September 2026');
  });

  it.each(['SESSION_EXPIRED', 'SECOND_FACTOR_REQUIRED', 'NETWORK'])('words a %s failure in its own sentence and does not probe', async (code) => {
    listReports.mockResolvedValue(fail(code));
    await renderPanel();
    expect(document.querySelector('[role="alert"]').textContent).toContain(LIST_FAILURE[code]);
    expect(reportsTableMissing).not.toHaveBeenCalled();
  });
});

describe('Generate now', () => {
  const openConfirm = async () => {
    listReports.mockResolvedValue({ success: true, data: [] });
    await renderPanel();
    click(button('Generate now'));
    return document.querySelector('[role="alertdialog"]');
  };
  const confirmIn = (dialog) => button('Generate now', dialog);

  it('asks first, explaining the partial period', async () => {
    const confirm = await openConfirm();
    expect(confirm.querySelector('#dialog-title').textContent).toBe('Generate a partial report?');
    expect(confirm.textContent).toContain('It covers 1 October to 19 November, only part of Q4 2026');
    click(button('Cancel', confirm));
    expect(generateReport).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('reports success, notifies and reloads the archive', async () => {
    generateReport.mockResolvedValue({ success: true, data: { id: 'n1', quarter: 'Q4 2026', partial: true, email_status: 'sent' } });
    const confirm = await openConfirm();
    listReports.mockResolvedValue({ success: true, data: [report({ id: 'n1', partial: true, trigger: 'manual', period_label: 'October to November 2026', quarter: 'Q4 2026' })] });
    click(confirmIn(confirm));
    await flush();
    const line = 'Report for 1 October to 19 November saved below and emailed to you.';
    expect(document.querySelector('.ins-status').textContent).toBe(line);
    expect(document.querySelector('.ins-status').classList.contains('is-good')).toBe(true);
    expect(notify).toHaveBeenCalledWith(line, 'ok');
    expect(text()).toContain('October to November 2026');
  });

  it('warns when the email did not send', async () => {
    generateReport.mockResolvedValue({ success: true, data: { id: 'n1', email_status: 'failed' } });
    click(confirmIn(await openConfirm()));
    await flush();
    expect(document.querySelector('.ins-status').textContent).toContain('saved below, but the email did not send');
    expect(document.querySelector('.ins-status').classList.contains('is-warn')).toBe(true);
    expect(notify).toHaveBeenCalledWith(expect.any(String), 'warn');
  });

  it('shows the service sentence on failure and allows another try', async () => {
    generateReport.mockResolvedValue(fail('SECOND_FACTOR_REQUIRED', 'Enter your authenticator code first, then make the report.'));
    click(confirmIn(await openConfirm()));
    await flush();
    expect(document.querySelector('.ins-status').textContent).toBe('Enter your authenticator code first, then make the report.');
    expect(document.querySelector('.ins-status').classList.contains('is-bad')).toBe(true);
    expect(notify).not.toHaveBeenCalled();
    expect(button('Generate now').disabled).toBe(false);
  });

  it('turns a missing function into "not set up"', async () => {
    generateReport.mockResolvedValue(fail('NOT_CONFIGURED', 'The report is not set up yet.'));
    click(confirmIn(await openConfirm()));
    await flush();
    expect(text()).toContain('Not set up yet');
    expect(document.querySelector('.ins-status').textContent).toBe('The report is not set up yet.');
    expect(button('Generate now').disabled).toBe(true);
  });
});
