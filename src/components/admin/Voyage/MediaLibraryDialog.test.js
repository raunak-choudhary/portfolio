/* eslint-disable testing-library/no-node-access */
import MediaLibraryDialog from './MediaLibraryDialog';
import { React, act, click, mount, setInputValue } from '../SkyBackground/testUtils';

// a script URL, built so the linter does not read the test itself as one
const SCRIPT_URL = ['javascript', 'alert(1)'].join(':');

jest.mock('../../../services/mediaLibraryService', () => ({
  getMediaLibrarySnapshot: jest.fn(),
  readReferences: jest.fn(),
  deleteMediaFiles: jest.fn(),
  createMediaSignedUrl: jest.fn(),
  MEDIA_LIBRARY_BUCKETS: [{ id: 'project-images', label: 'Project images' }, { id: 'documents', label: 'Documents' }],
  REFERENCE_TABLES: [{ table: 'projects' }, { table: 'hero_content' }],
}));
const service = jest.requireMock('../../../services/mediaLibraryService');

// ---- a small library: two files in use, two not connected (one a likely copy), one broken link ----
const item = (bucketId, path, extra = {}) => ({
  id: `${bucketId}:${path}`, bucketId, bucketLabel: bucketId === 'documents' ? 'Documents' : 'Project images', path, name: path.split('/').pop(),
  kind: 'image', size: 1024, isPrivate: false, previewUrl: `https://cdn.example.com/${path}`, updatedAt: '2026-11-10T00:00:00Z', ...extra,
});
const ref = (bucketId, path, extra = {}) => ({
  keys: [`${bucketId}:${path}`], bucketId, path, table: 'projects', section: 'Projects', rowId: 'p1', title: 'LoRA Fine-Tuning',
  field: 'image_urls', fieldLabel: 'Images', position: 1, count: 1, explicit: true, ...extra,
});
const used = item('project-images', 'lora/matrix.png', { size: 4000 });
const resume = item('documents', 'resume.pdf', { kind: 'pdf', size: 2000 });
const stale = item('project-images', 'old/stale.png', { size: 3000, updatedAt: '2026-11-12T00:00:00Z' });
const copy = item('project-images', 'old/matrix (1).png', { size: 4000, updatedAt: '2026-11-11T00:00:00Z' });
const references = [
  ref('project-images', 'lora/matrix.png'),
  ref('documents', 'resume.pdf', { table: 'hero_content', section: 'Hero', rowId: 'h1', title: 'Resume', field: 'resume_url', fieldLabel: 'Resume' }),
  ref('project-images', 'lora/gone.png', { position: 2, count: 2 }),
];
const snapshot = (extra = {}) => ({
  buckets: [{ id: 'project-images', label: 'Project images', status: 'available', complete: true }, { id: 'documents', label: 'Documents', status: 'available', complete: true }],
  items: [used, resume, stale, copy],
  references,
  referenceErrors: [],
  referenceErrorSections: [],
  ...extra,
});

const flush = () => act(async () => { for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0)); });
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const buttonByText = (text, root = document) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const tab = (label) => $$('[role="tab"]').find((t) => t.textContent.startsWith(label));
const key = (k, extra = {}) => act(() => { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra })); });

describe('MediaLibraryDialog', () => {
  let onClose, onOpenEntry, view, matchMediaOriginal;

  const open = async (props = {}) => {
    view = mount(<MediaLibraryDialog open onClose={onClose} onOpenEntry={onOpenEntry} {...props} />);
    await flush();
    return view;
  };

  beforeEach(() => {
    onClose = jest.fn();
    onOpenEntry = jest.fn();
    service.getMediaLibrarySnapshot.mockResolvedValue(snapshot());
    service.readReferences.mockResolvedValue({ references, failedTables: [], failedSections: [] });
    service.deleteMediaFiles.mockImplementation(async (files) => ({ deleted: files, failed: [] }));
    service.createMediaSignedUrl.mockResolvedValue('https://example.supabase.co/storage/v1/object/sign/contact-attachments/x?token=t');
    matchMediaOriginal = window.matchMedia;
    window.matchMedia = undefined;   // lightbox mode, as on a phone
  });

  afterEach(() => {
    view?.unmount();
    view = null;
    window.matchMedia = matchMediaOriginal;
    document.body.style.overflow = '';
  });

  it('says what it is reading, then shows the summary and the in-use files grouped by section', async () => {
    let resolve;
    service.getMediaLibrarySnapshot.mockReturnValue(new Promise((r) => { resolve = r; }));
    view = mount(<MediaLibraryDialog open onClose={onClose} onOpenEntry={onOpenEntry} />);
    expect($('[data-testid="media-library"]').textContent).toContain('Reading 2 buckets and checking 2 sections');
    await act(async () => { resolve(snapshot()); });
    await flush();
    const dialog = $('[data-testid="media-library"]');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const summary = $('.media-summary').textContent;
    expect(summary).toContain('4 files');
    expect(summary).toContain('of 1 GB used');
    expect(summary).toContain('2 not connected (6.8 KB)');
    expect(tab('In use').getAttribute('aria-selected')).toBe('true');
    expect($$('.media-group__head').map((h) => h.firstChild.textContent)).toEqual(['Hero', 'Projects']);
    expect(dialog.textContent).toContain('Used by Projects · LoRA Fine-Tuning');
    // a real thumbnail for the image, a plain mark for the PDF
    expect($('[data-file="project-images:lora/matrix.png"] img').getAttribute('src')).toBe('https://cdn.example.com/lora/matrix.png');
    expect($('[data-file="project-images:lora/matrix.png"] img').getAttribute('loading')).toBe('lazy');
    expect($('[data-file="documents:resume.pdf"] .media-thumb__mark').textContent).toBe('PDF');
    // focus starts on the close button and the page behind stops scrolling
    expect(document.activeElement.getAttribute('aria-label')).toBe('Close files');
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('blocks deleting a file in use, names its entry, and opens that entry', async () => {
    await open();
    click($('[data-file="project-images:lora/matrix.png"] .media-row__delete'));
    const message = $('[role="alertdialog"]');
    expect(message.textContent).toContain('This file is in use');
    expect(message.textContent).toContain('This file is used by Projects · LoRA Fine-Tuning. Detach it there first');
    expect(document.activeElement.textContent).toBe('Open that entry');
    click(buttonByText('Open that entry', message));
    expect(onOpenEntry).toHaveBeenCalledWith({ table: 'projects', rowId: 'p1', section: 'Projects', title: 'LoRA Fine-Tuning' });
    expect(service.deleteMediaFiles).not.toHaveBeenCalled();
  });

  it('selects not-connected files, confirms with their names and total, and reports a file kept by the last check', async () => {
    await open();
    click(tab('Not connected'));
    expect($('.media-note').textContent).toContain('safe to delete');
    // the copy carries a plain-text hint and stays selectable
    expect($('[data-file="project-images:old/matrix (1).png"]').textContent).toContain('Possible duplicate of matrix.png, which is in use');
    const boxes = $$('.media-row__check input');
    expect(boxes).toHaveLength(2);
    boxes.forEach((b) => setInputValue(b, true));
    expect($('.media-foot__all').textContent).toContain('2 selected · 6.8 KB');
    click(buttonByText('Delete 2 files'));
    const confirm = $('[role="alertdialog"]');
    expect(confirm.textContent).toContain('Delete 2 files?');
    expect(confirm.textContent).toContain('stale.png');
    expect(confirm.textContent).toContain('matrix (1).png');
    expect(confirm.textContent).toContain('free 6.8 KB');
    expect(document.activeElement.textContent).toBe('Cancel');

    // between loading and confirming, someone attached stale.png to an achievement
    service.readReferences.mockResolvedValue({ references: [...references, ref('project-images', 'old/stale.png', { table: 'achievements', section: 'Achievements', rowId: 'a9', title: 'Award' })], failedTables: [], failedSections: [] });
    service.getMediaLibrarySnapshot.mockClear();
    click(buttonByText('Delete 2 files', confirm));
    await flush();
    expect(service.readReferences).toHaveBeenCalledTimes(1);
    expect(service.deleteMediaFiles).toHaveBeenCalledTimes(1);
    const [sent, options] = service.deleteMediaFiles.mock.calls[0];
    expect(sent.map((f) => f.id)).toEqual(['project-images:old/matrix (1).png']);
    expect(options.listedIds.has('project-images:old/stale.png')).toBe(true);
    const report = $('[data-testid="media-report"]').textContent;
    expect(report).toContain('1 file deleted, 1 kept');
    expect(report).toContain('stale.png');
    expect(report).toContain('Achievements · Award');
    expect(service.getMediaLibrarySnapshot).toHaveBeenCalledTimes(1);   // the list reloads quietly
    expect($('[role="alertdialog"]')).toBeNull();
  });

  it('deletes nothing when the last check cannot read every section', async () => {
    await open({ initialTab: 'not-connected' });
    setInputValue($$('.media-row__check input')[0], true);
    click(buttonByText('Delete 1 file'));
    service.readReferences.mockResolvedValue({ references: [], failedTables: ['skills'], failedSections: ['Skills'] });
    click(buttonByText('Delete 1 file', $('[role="alertdialog"]')));
    await flush();
    expect(service.deleteMediaFiles).not.toHaveBeenCalled();
    const report = $('[data-testid="media-report"]').textContent;
    expect(report).toContain('Nothing was deleted');
    expect(report).toContain('could not read Skills');
  });

  it('deletes nothing when the last check fails outright', async () => {
    await open({ initialTab: 'not-connected' });
    click($('[data-file="project-images:old/stale.png"] .media-row__delete'));
    service.readReferences.mockRejectedValue(new Error('offline'));
    click(buttonByText('Delete 1 file', $('[role="alertdialog"]')));
    await flush();
    expect(service.deleteMediaFiles).not.toHaveBeenCalled();
    const report = $('[data-testid="media-report"]').textContent;
    expect(report).toContain('Nothing was deleted');
    expect(report).toContain('could not read every section');
    expect(report).not.toContain('unknown');
  });

  it('turns delete off everywhere while a section could not be read, and Try again reloads', async () => {
    service.getMediaLibrarySnapshot.mockResolvedValue(snapshot({ referenceErrors: ['skills', 'certifications'], referenceErrorSections: ['Skills', 'Certifications'] }));
    await open({ initialTab: 'not-connected' });
    const banner = $('[data-testid="media-refs-failed"]');
    expect(banner.textContent).toContain('Nothing can be deleted right now');
    expect(banner.textContent).toContain('Skills and Certifications could not be checked');
    expect($$('.media-row__check input').every((b) => b.disabled)).toBe(true);
    expect($$('.media-row__delete').every((b) => b.disabled)).toBe(true);
    expect(buttonByText('Delete').disabled).toBe(true);
    expect($('.media-foot__off').textContent).toBe('Delete is off');
    service.getMediaLibrarySnapshot.mockResolvedValue(snapshot());
    click(buttonByText('Try again', banner));
    await flush();
    expect($('[data-testid="media-refs-failed"]')).toBeNull();
    expect($$('.media-row__check input').some((b) => b.disabled)).toBe(false);
  });

  it('lists broken links with Open that entry and Copy path', async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await open({ initialTab: 'broken' });
    expect(tab('Broken links').getAttribute('aria-selected')).toBe('true');
    expect($('select[aria-label="Sort"]')).toBeNull();   // nothing to sort by on this tab
    const row = $('.media-row--broken');
    expect(row.textContent).toContain('LoRA Fine-Tuning');
    expect(row.textContent).toContain('Images: file 2 of 2 points at a missing file');
    expect(row.textContent).toContain('project-images/lora/gone.png');
    click(buttonByText('Copy path', row));
    await flush();
    expect(writeText).toHaveBeenCalledWith('project-images/lora/gone.png');
    expect($('.media-dialog__status').textContent).toBe('Path copied');
    click(buttonByText('Open that entry', row));
    expect(onOpenEntry).toHaveBeenCalledWith(expect.objectContaining({ table: 'projects', rowId: 'p1' }));
  });

  it('searches names and entry titles, filters by bucket and sorts', async () => {
    await open({ initialTab: 'not-connected' });
    const names = () => $$('.media-row__name').map((n) => n.textContent);
    expect(names()).toEqual(['stale.png', 'matrix (1).png']);   // newest first
    act(() => { const s = $('select[aria-label="Sort"]'); s.value = 'name'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(names()).toEqual(['matrix (1).png', 'stale.png']);
    setInputValue($('input[type="search"]'), 'stale');
    expect(names()).toEqual(['stale.png']);
    setInputValue($('input[type="search"]'), '');
    click(tab('In use'));
    setInputValue($('input[type="search"]'), 'lora fine');   // an entry title, not a file name
    expect(names()).toEqual(['matrix.png']);
    setInputValue($('input[type="search"]'), '');
    act(() => { const s = $('select[aria-label="Bucket"]'); s.value = 'documents'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(names()).toEqual(['resume.pdf']);
  });

  it('closes the top layer first on Escape, returns focus, then closes the pop-up', async () => {
    await open();
    const trash = $('[data-file="documents:resume.pdf"] .media-row__delete');
    trash.focus();
    click(trash);
    expect($('[role="alertdialog"]')).not.toBeNull();
    key('Escape');
    expect($('[role="alertdialog"]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await flush();
    expect(document.activeElement).toBe(trash);
    key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the open layer', async () => {
    await open();
    click($('[data-file="documents:resume.pdf"] .media-row__delete'));
    const layer = $('[role="alertdialog"]');
    const buttons = [...layer.querySelectorAll('button')];
    buttons[buttons.length - 1].focus();
    key('Tab');
    expect(layer.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('opens a file in the lightbox below 1100 px with Copy link, Open and who uses it', async () => {
    await open();
    click($('[data-file="project-images:lora/matrix.png"] .media-row__main'));
    const box = $('.media-layer__panel--lightbox');
    expect(box).not.toBeNull();
    expect(box.textContent).toContain('Used by');
    expect(box.textContent).toContain('LoRA Fine-Tuning');
    const link = [...box.querySelectorAll('a')].find((a) => a.textContent === 'Open');
    expect(link.getAttribute('href')).toBe('https://cdn.example.com/lora/matrix.png');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect($('.media-pane')).toBeNull();
    key('Escape');
    expect($('.media-layer__panel--lightbox')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the preview pane beside the list from 1100 px', async () => {
    window.matchMedia = (query) => ({ matches: query.includes('1100px'), addEventListener() {}, removeEventListener() {} });
    await open();
    const pane = $('.media-pane');
    expect(pane).not.toBeNull();
    expect(pane.textContent).toContain('resume.pdf');   // the first row, Hero's resume
    click($('[data-file="project-images:lora/matrix.png"] .media-row__main'));
    expect($('.media-pane').textContent).toContain('matrix.png');
    expect($('.media-layer')).toBeNull();
  });

  it('signs a fresh link for a private file, and never renders a link that is not http or https', async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const secret = item('contact-attachments', 'contact-attachments/cv.pdf', { kind: 'pdf', isPrivate: true, previewUrl: SCRIPT_URL });
    service.getMediaLibrarySnapshot.mockResolvedValue(snapshot({ items: [secret] }));
    await open({ initialTab: 'not-connected' });
    click($('[data-file="contact-attachments:contact-attachments/cv.pdf"] .media-row__main'));
    const box = $('.media-layer__panel--lightbox');
    expect([...box.querySelectorAll('a')].some((a) => /javascript/.test(a.getAttribute('href')))).toBe(false);
    click(buttonByText('Copy link', box));
    await flush();
    expect(service.createMediaSignedUrl).toHaveBeenCalledWith('contact-attachments', 'contact-attachments/cv.pdf', 300);
    expect(writeText).toHaveBeenCalledWith('https://example.supabase.co/storage/v1/object/sign/contact-attachments/x?token=t');
  });

  it('says so when the files cannot be read, and offers Try again', async () => {
    service.getMediaLibrarySnapshot.mockRejectedValue(new Error('offline'));
    await open();
    expect($('[data-testid="media-library"]').textContent).toContain('The files could not be read.');
    service.getMediaLibrarySnapshot.mockResolvedValue(snapshot());
    click(buttonByText('Try again'));
    await flush();
    expect($('.media-summary').textContent).toContain('4 files');
  });

  it('renders nothing while closed', () => {
    view = mount(<MediaLibraryDialog open={false} onClose={onClose} onOpenEntry={onOpenEntry} />);
    expect($('[data-testid="media-library"]')).toBeNull();
    expect(service.getMediaLibrarySnapshot).not.toHaveBeenCalled();
  });
});
