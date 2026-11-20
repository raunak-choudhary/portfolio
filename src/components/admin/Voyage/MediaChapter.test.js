/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import MediaChapter from './MediaChapter';
import { PAGE_SIZE } from './mediaModel';
import { React, act, click, mount, setInputValue } from '../SkyBackground/testUtils';

jest.mock('../../../services/mediaLibraryService', () => ({ getMediaLibrarySnapshot: jest.fn(), createMediaSignedUrl: jest.fn(), MEDIA_LIBRARY_BUCKETS: [] }));
const media = jest.requireMock('../../../services/mediaLibraryService');

const flush = () => act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
const item = (id, extra = {}) => ({ id: `project-images:${id}`, bucketId: 'project-images', bucketLabel: 'Project Images', path: `projects/${id}.png`, name: `${id}.png`, kind: 'image', size: 2048, sizeLabel: '2 KB', updatedAt: '2026-11-10T00:00:00Z', isPrivate: false, isReferenced: true, status: 'referenced', previewUrl: `https://example.com/${id}.png`, ...extra });
const buckets = [
  { id: 'project-images', label: 'Project Images', isPublic: true, status: 'available' },
  { id: 'contact-attachments', label: 'Contact Attachments', isPublic: false, status: 'available' },
  { id: 'documents', label: 'Documents', isPublic: true, status: 'error', error: 'refused' },
];
const snapshot = (items) => ({ buckets, items, summary: {}, generatedAt: '2026-11-18T00:00:00Z' });
const names = (c) => [...c.querySelectorAll('.plate__name')].map((n) => n.textContent);

describe('MediaChapter', () => {
  let notify;
  beforeEach(() => {
    notify = jest.fn();
    media.getMediaLibrarySnapshot.mockResolvedValue(snapshot([
      item('hero', { updatedAt: '2026-11-15T00:00:00Z' }),
      item('old', { status: 'unknown', isReferenced: false, updatedAt: '2026-11-01T00:00:00Z' }),
      item('cv', { id: 'contact-attachments:contact-attachments/cv.pdf', bucketId: 'contact-attachments', bucketLabel: 'Contact Attachments', path: 'contact-attachments/cv.pdf', name: 'cv.pdf', kind: 'pdf', isPrivate: true, previewUrl: 'https://example.com/signed-at-load', updatedAt: '2026-11-12T00:00:00Z' }),
      item('placeholder', { name: '.emptyFolderPlaceholder' }),
    ]));
  });
  afterEach(() => { document.body.innerHTML = ''; jest.restoreAllMocks(); });

  it('shows the library newest first with a summary, stamps, lazy thumbnails and type marks, and offers no delete', async () => {
    const view = mount(<MediaChapter notify={notify} />);
    await flush();
    expect(names(view.container)).toEqual(['hero.png', 'cv.pdf', 'old.png']);   // the folder marker is not a file
    expect(view.container.querySelector('.media__summary').textContent).toBe('Files3Referenced2Unknown1Private1Stored6 KB');
    const plates = view.container.querySelectorAll('.plate');
    expect(plates[0].querySelector('img').getAttribute('loading')).toBe('lazy');
    expect(plates[1].querySelector('.plate__mark').textContent).toBe('PDF');
    expect(plates[1].textContent).toContain('Private');
    expect(plates[2].querySelector('.stamp').textContent).toBe('Unknown');
    expect(view.container.querySelector('.media__warn').textContent).toBe('Documents could not be listed, so its files are missing here.');
    expect([...view.container.querySelectorAll('button')].some((b) => /delete/i.test(b.textContent))).toBe(false);
    view.unmount();
  });

  it('filters by status, bucket and search', async () => {
    const view = mount(<MediaChapter notify={notify} />);
    await flush();
    click([...view.container.querySelectorAll('.inbox__filter')].find((b) => b.textContent.startsWith('Unknown')));
    expect(names(view.container)).toEqual(['old.png']);
    click([...view.container.querySelectorAll('.inbox__filter')].find((b) => b.textContent.startsWith('All')));
    const select = view.container.querySelector('.media__bucket select');
    act(() => { select.value = 'contact-attachments'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(names(view.container)).toEqual(['cv.pdf']);
    act(() => { select.value = 'all'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    setInputValue(view.container.querySelector('.inbox__search input'), 'hero');
    expect(names(view.container)).toEqual(['hero.png']);
    view.unmount();
  });

  it('falls back to a type mark when a thumbnail fails to load', async () => {
    const view = mount(<MediaChapter notify={notify} />);
    await flush();
    const img = view.container.querySelector('.plate img');
    act(() => { img.dispatchEvent(new Event('error')); });
    expect(view.container.querySelector('.plate .plate__mark').textContent).toBe('PNG');
    view.unmount();
  });

  it('opens public files directly and signs a lapsed private link afresh', async () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    const opened = jest.spyOn(window, 'open').mockImplementation(() => null);
    media.createMediaSignedUrl.mockResolvedValue('https://example.com/fresh');
    const view = mount(<MediaChapter notify={notify} />);
    await flush();
    const links = view.container.querySelectorAll('.plate a');
    expect(links[0].getAttribute('href')).toBe('https://example.com/hero.png');
    expect(links[0].rel).toBe('noopener noreferrer');
    now.mockReturnValue(1_000_000 + 5 * 60 * 1000);   // the link made at load has lapsed
    await act(async () => { links[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    await flush();
    expect(media.createMediaSignedUrl).toHaveBeenCalledWith('contact-attachments', 'contact-attachments/cv.pdf', 300);
    expect(opened).toHaveBeenCalledWith('https://example.com/fresh', '_blank', 'noopener,noreferrer');
    view.unmount();
  });

  it('pages long libraries and retries a failed read', async () => {
    media.getMediaLibrarySnapshot.mockRejectedValueOnce(new Error('offline'));
    const many = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => item(`f${String(i).padStart(2, '0')}`));
    media.getMediaLibrarySnapshot.mockResolvedValueOnce(snapshot(many));
    const view = mount(<MediaChapter notify={notify} />);
    await flush();
    expect(view.container.querySelector('.deck__error').textContent).toContain('could not be read');
    click([...view.container.querySelectorAll('.deck__error button')][0]);
    await flush();
    expect(view.container.querySelectorAll('.plate')).toHaveLength(PAGE_SIZE);
    click([...view.container.querySelectorAll('.media__more button')][0]);
    expect(view.container.querySelectorAll('.plate')).toHaveLength(PAGE_SIZE + 5);
    expect(view.container.querySelector('.media__more')).toBeNull();
    view.unmount();
  });

  it('says which sections could not be read, so Unknown is not taken at face value', async () => {
    media.getMediaLibrarySnapshot.mockResolvedValue({ ...snapshot([item('a', { isReferenced: false, status: 'unknown' })]), referenceErrors: ['projects', 'skills'] });
    const view = mount(<MediaChapter notify={notify} />);
    await flush();
    const warn = view.container.querySelector('[data-testid="media-reference-warning"]');
    expect(warn.textContent).toContain('2 sections could not be read (projects, skills)');
    view.unmount();
  });

  it('shows no such warning when every section was read', async () => {
    media.getMediaLibrarySnapshot.mockResolvedValue({ ...snapshot([item('a')]), referenceErrors: [] });
    const view = mount(<MediaChapter notify={notify} />);
    await flush();
    expect(view.container.querySelector('[data-testid="media-reference-warning"]')).toBeNull();
    view.unmount();
  });
});
