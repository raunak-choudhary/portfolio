import { safeResumeUrl } from './resumeLink';

const PROJECT = 'https://abcproject.supabase.co';
const GOOD = `${PROJECT}/storage/v1/object/public/documents/resume/raunak-choudhary-resume-1763740000000.pdf`;

describe('safeResumeUrl', () => {
  it('accepts a PDF in this project\'s documents/resume folder', () => {
    expect(safeResumeUrl(GOOD, PROJECT)).toBe(GOOD);
  });

  it.each([
    ['nothing set', null],
    ['an empty string', ''],
    ['a number', 42],
    ['not a URL', 'resume.pdf'],
    ['plain http', GOOD.replace('https:', 'http:')],
    ['another Supabase project', GOOD.replace('abcproject', 'someoneelse')],
    ['another site', 'https://example.com/storage/v1/object/public/documents/resume/cv.pdf'],
    ['another bucket', `${PROJECT}/storage/v1/object/public/project-images/resume/cv.pdf`],
    ['another folder', `${PROJECT}/storage/v1/object/public/documents/internships/cv.pdf`],
    ['not a PDF', `${PROJECT}/storage/v1/object/public/documents/resume/cv.html`],
    ['a query string', `${GOOD}?download=1`],
    ['an anchor', `${GOOD}#page=2`],
    ['a path that climbs out', `${PROJECT}/storage/v1/object/public/documents/resume/../../x.pdf`],
    ['too long', `${PROJECT}/storage/v1/object/public/documents/resume/${'a'.repeat(500)}.pdf`],
  ])('refuses %s', (_label, value) => {
    expect(safeResumeUrl(value, PROJECT)).toBeNull();
  });

  it('refuses everything when the project address is unknown', () => {
    expect(safeResumeUrl(GOOD, undefined)).toBeNull();
    expect(safeResumeUrl(GOOD, '')).toBeNull();
  });
});
