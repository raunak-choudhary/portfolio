// The seven list sections (education, work experience, internships,
// certifications, achievements, leadership, recommendations): each covers the
// columns the admin data spec lists, keeps the classic limits, fixes the
// classic defects the spec names, and loads every recorded live row (the
// e2e fixtures) as a valid form with nothing to save.

import { educationSchema, gradeText, institutionLogoUpload } from './education.schema';
import { companyLogoUpload, workExperienceSchema } from './workExperience.schema';
import { TECHNOLOGY_SUGGESTIONS, internshipCertificateUpload, internshipLogoUpload, internshipsSchema } from './internships.schema';
import { badgeUpload, certificateFileUpload, certificationsSchema, issuerLogoUpload } from './certifications.schema';
import { POSITIONS, achievementCertificateUpload, achievementsSchema } from './achievements.schema';
import { leadershipSchema } from './leadership.schema';
import { countWords, recommenderPhotoUpload, recommendationsSchema } from './recommendations.schema';
import { dateRange, featuredFirst, isPast, monthYear, orderThenDate } from './sectionKit';
import { applyChange, buildForm, canDrag, cardFlags, cleanupTargets, isDirty, isPublic, normalizeForm, orderWritesFor, sortRows, todayIso, validateForm } from './schemaModel';

import liveEducation from '../../../../../e2e/fixtures/education.json';
import liveWork from '../../../../../e2e/fixtures/work_experience.json';
import liveInternships from '../../../../../e2e/fixtures/internships.json';
import liveCertifications from '../../../../../e2e/fixtures/certifications.json';
import liveAchievements from '../../../../../e2e/fixtures/achievements.json';
import liveLeadership from '../../../../../e2e/fixtures/leadership.json';
import liveRecommendations from '../../../../../e2e/fixtures/recommendations.json';

const keys = (schema) => schema.fields.map((f) => f.key).sort();
const field = (schema, key) => schema.fields.find((f) => f.key === key);
const errorsFor = (schema, row, changes) => validateForm(schema, { ...buildForm(schema, row), ...changes });
const STORAGE = 'https://x.supabase.co/storage/v1/object/public';
const MiB = 1024 * 1024;

/** Server limits of each storage bucket as configured in Supabase: no client rule may promise more. */
const BUCKETS = {
  'organization-logos': { max: 2 * MiB, types: ['image/jpeg', 'image/png', 'image/jpg', 'image/svg+xml', 'image/webp'] },
  documents: { max: 15 * MiB, types: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif'] },
  'certification-badges': { max: 15 * MiB, types: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'] },
  'achievement-images': { max: 10 * MiB, types: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'] },
  'profile-images': { max: 5 * MiB, types: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'] },
};

const ALL = [
  ['education', educationSchema, liveEducation],
  ['work_experience', workExperienceSchema, liveWork],
  ['internships', internshipsSchema, liveInternships],
  ['certifications', certificationsSchema, liveCertifications],
  ['achievements', achievementsSchema, liveAchievements],
  ['leadership', leadershipSchema, liveLeadership],
  ['recommendations', recommendationsSchema, liveRecommendations],
];

describe.each(ALL)('%s schema, shared contract', (table, schema, live) => {
  it('names its table, puts every field in a group and keeps the status visibility', () => {
    expect(schema.table).toBe(table);
    const grouped = schema.groups.flatMap((g) => g.keys);
    expect([...grouped].sort()).toEqual(keys(schema));   // each field once, none left out
    expect(field(schema, 'status').options.map((o) => o.value)).toEqual(['active', 'draft', 'archived']);
    expect(isPublic(schema, { status: 'draft', is_public: true })).toBe(false);
  });

  it('loads every recorded live row as a valid form with nothing to save', () => {
    expect(live.length).toBeGreaterThan(0);
    live.forEach((row) => {
      const form = buildForm(schema, row);
      expect([row.id, validateForm(schema, form)]).toEqual([row.id, {}]);
      expect([row.id, isDirty(schema, form, row)]).toEqual([row.id, false]);
      expect(typeof schema.card(row).title).toBe('string');
      expect(schema.searchText(row)).toBe(schema.searchText(row).toLowerCase());
    });
  });

  it('keeps every upload within its bucket size and file types', () => {
    schema.fields.filter((f) => f.upload).forEach((f) => {
      const bucket = BUCKETS[f.upload.bucket];
      expect([f.key, f.upload.maxBytes <= bucket.max]).toEqual([f.key, true]);
      f.upload.accept.forEach((type) => expect([f.key, type, bucket.types.includes(type)]).toEqual([f.key, type, true]));
    });
  });

  it('cleans up exactly the file columns it owns, in their own buckets', () => {
    const files = schema.fields.filter((f) => f.upload).map((f) => ({ key: f.key, bucket: f.upload.bucket }));
    expect(schema.cleanup || []).toEqual(files);
  });
});

describe('education', () => {
  const row = liveEducation.find((r) => r.max_gpa_scale === '4.0') || liveEducation[0];
  it('covers every education column of the spec', () => {
    expect(keys(educationSchema)).toEqual(['achievements', 'activities', 'college', 'coursework', 'degree', 'degree_type', 'description', 'education_level', 'education_status', 'end_date', 'gpa_received', 'institution', 'institution_logo_url', 'location', 'major', 'max_gpa_scale', 'minor', 'start_date', 'status', 'thesis_title']);
    expect(canDrag(educationSchema)).toBe(false);
  });
  it('reads the lower-case status of the live rows as an option and saves the capitalised spelling', () => {
    const legacy = { ...row, education_status: 'completed' };
    const form = buildForm(educationSchema, legacy);
    expect(form.education_status).toBe('Completed');
    expect(normalizeForm(educationSchema, form).education_status).toBe('Completed');
    expect(buildForm(educationSchema, null).education_status).toBe('Completed');
    expect(educationSchema.card(legacy).chips).toContain('Completed');
  });
  it('keeps GPA text as typed and checks it against the scale', () => {
    expect(normalizeForm(educationSchema, { ...buildForm(educationSchema, row), gpa_received: '3.50', max_gpa_scale: '4.0' })).toEqual(expect.objectContaining({ gpa_received: '3.50', max_gpa_scale: '4.0' }));
    expect(errorsFor(educationSchema, row, { gpa_received: '4.5', max_gpa_scale: '4.0' }).gpa_received).toBe('GPA or grade received cannot be above the maximum scale.');
    expect(errorsFor(educationSchema, row, { gpa_received: 'A+' }).gpa_received).toBe('GPA or grade received must be a number.');
    expect(errorsFor(educationSchema, row, { gpa_received: '-1' }).gpa_received).toBeTruthy();
    expect(errorsFor(educationSchema, row, { gpa_received: '9', max_gpa_scale: '' })).toEqual({});   // a grade without a scale is allowed, as in classic
    expect([gradeText('74.40', '100'), gradeText('3.9', '4.0'), gradeText('', '4.0'), gradeText('8', '')]).toEqual(['74.40%', '3.9/4.0', '', '8']);
  });
  it('needs an end date strictly after the start and the classic text limits', () => {
    expect(errorsFor(educationSchema, row, { start_date: '2024-09-03', end_date: '2024-09-03' }).end_date).toBe('End date must be after the start date.');
    const errors = errorsFor(educationSchema, row, { degree: 'MS', college: '', thesis_title: 'x'.repeat(301), coursework: Array(31).fill('c').map((c, i) => c + i) });
    expect(Object.keys(errors).sort()).toEqual(['college', 'coursework', 'degree', 'thesis_title']);
  });
  it('names the logo after the institution, inside education/', () => {
    expect(institutionLogoUpload.path({ form: { institution: 'New York University', college: 'Tandon' }, stamp: 5, ext: 'png' })).toBe('education/new-york-university-logo-5.png');
    expect(institutionLogoUpload.path({ form: { institution: '', college: 'Tandon' }, stamp: 5, ext: 'png' })).toBe('education/tandon-logo-5.png');
  });
});

describe('work experience', () => {
  const row = liveWork[0];
  it('covers every remaining column and none of the removed personal ones', () => {
    expect(keys(workExperienceSchema)).toEqual(['achievements', 'clients_served', 'company', 'company_logo_url', 'department', 'description', 'employment_type', 'end_date', 'is_current', 'job_number', 'key_responsibilities', 'location', 'start_date', 'status', 'team_size', 'technologies', 'title']);
    ['salary_range', 'performance_rating', 'reason_for_leaving'].forEach((k) => expect(keys(workExperienceSchema)).not.toContain(k));
  });
  it('clears and skips the end date while the role is current', () => {
    const form = applyChange(workExperienceSchema, buildForm(workExperienceSchema, row), 'is_current', true);
    expect(form.end_date).toBe('');
    expect(validateForm(workExperienceSchema, { ...form, end_date: '2000-01-01' })).toEqual({});   // disabled: neither checked nor saved
    expect(normalizeForm(workExperienceSchema, { ...form, end_date: '2000-01-01' }).end_date).toBeNull();
    expect(errorsFor(workExperienceSchema, row, { end_date: row.start_date }).end_date).toBe('End date must be after the start date.');
  });
  it('shows the company, the dates and a current flag on its card', () => {
    expect(workExperienceSchema.card(row)).toEqual(expect.objectContaining({ title: 'Systems Engineer', subtitle: 'Tata Consultancy Services · Bengaluru, Karnataka, India', chips: ['Full-time', 'Aug 2021 to Jul 2024'], flags: [] }));
    expect(workExperienceSchema.card({ ...row, is_current: true, end_date: null }).chips).toContain('Aug 2021 to now');
    expect(workExperienceSchema.card({ ...row, is_current: true }).flags).toEqual(['current']);
    expect(companyLogoUpload.path({ form: { company: 'Tata Consultancy Services' }, stamp: 1, ext: 'webp' })).toBe('work/tata-consultancy-services-logo-1.webp');
    expect(companyLogoUpload.maxBytes).toBe(2 * MiB);
  });
});

describe('internships', () => {
  const row = liveInternships[0];
  it('covers every column, offers technology suggestions and owns a drag order, low first', () => {
    expect(keys(internshipsSchema)).toEqual(['achievements', 'certificate_urls', 'company', 'company_logo_url', 'description', 'duration', 'end_date', 'internship_number', 'internship_type', 'key_responsibilities', 'location', 'order_index', 'skills_gained', 'start_date', 'status', 'technologies', 'title']);
    expect(field(internshipsSchema, 'technologies').suggestions).toBe(TECHNOLOGY_SUGGESTIONS);
    expect(TECHNOLOGY_SUGGESTIONS).toHaveLength(27);
    expect(canDrag(internshipsSchema)).toBe(true);
    expect(orderWritesFor(internshipsSchema, ['a', 'b'])).toEqual([{ id: 'a', order_index: 1 }, { id: 'b', order_index: 2 }]);
  });
  it('orders like the public page: order number first (unset last), then the latest start', () => {
    const rows = [{ id: 1, order_index: null, start_date: '2020-07-01' }, { id: 2, order_index: 2, start_date: '2019-01-01' }, { id: 3, order_index: null, start_date: '2021-01-01' }, { id: 4, order_index: 1, start_date: '2018-01-01' }];
    expect(sortRows(internshipsSchema, rows).map((r) => r.id)).toEqual([4, 2, 3, 1]);
  });
  it('allows an end date on the start day but not before it, and five certificates at most', () => {
    expect(errorsFor(internshipsSchema, row, { start_date: '2020-07-12', end_date: '2020-07-12' })).toEqual({});
    expect(errorsFor(internshipsSchema, row, { start_date: '2020-07-12', end_date: '2020-07-11' }).end_date).toBe('End date cannot be before the start date.');
    const six = Array.from({ length: 6 }, (_, i) => `${STORAGE}/documents/internships/c-${i}.pdf`);
    expect(errorsFor(internshipsSchema, row, { certificate_urls: six }).certificate_urls).toBe('Certificates allows at most 5 entries.');
    expect(errorsFor(internshipsSchema, row, { order_index: 1000 }).order_index).toBe('Display order must be at most 999.');
    expect(errorsFor(internshipsSchema, row, { title: 'Dev' }).title).toBe('Internship title needs at least 5 characters.');
  });
  it('keeps certificates in documents without WebP (the bucket refuses it) and removes them with the logo', () => {
    expect(internshipCertificateUpload.accept).not.toContain('image/webp');
    expect(internshipCertificateUpload.path({ form: { title: 'Data Science Intern' }, index: 1, stamp: 9, ext: 'pdf' })).toBe('internships/data-science-intern-certificate-9-2.pdf');
    expect(internshipLogoUpload.path({ form: { company: 'Great Learning' }, stamp: 9, ext: 'png' })).toBe('internships/great-learning-logo-9.png');
    const owned = { company_logo_url: `${STORAGE}/organization-logos/internships/l.png`, certificate_urls: [`${STORAGE}/documents/internships/a.pdf`, 'https://elsewhere.example/b.pdf'] };
    expect(cleanupTargets(internshipsSchema, owned)).toEqual([{ bucket: 'organization-logos', urls: [owned.company_logo_url] }, { bucket: 'documents', urls: [owned.certificate_urls[0]] }]);
  });
});

describe('certifications', () => {
  const row = liveCertifications.find((r) => r.expiry_date) || liveCertifications[0];
  it('covers every certification column', () => {
    expect(keys(certificationsSchema)).toEqual(['badge_image_url', 'certificate_pdf_url', 'certification_number', 'certification_type', 'credential_id', 'credential_url', 'description', 'difficulty_level', 'expiry_date', 'is_featured', 'issue_date', 'issuer', 'issuer_logo_url', 'order_index', 'skills_covered', 'status', 'title', 'verification_status']);
    expect(canDrag(certificationsSchema)).toBe(false);
  });
  it('accepts a bare-domain credential link and saves it with https, query strings included', () => {
    const out = normalizeForm(certificationsSchema, { ...buildForm(certificationsSchema, row), credential_url: 'verify.certiport.com/check?id=7' });
    expect(out.credential_url).toBe('https://verify.certiport.com/check?id=7');
    expect(errorsFor(certificationsSchema, row, { credential_url: 'not a link' }).credential_url).toBeTruthy();
  });
  it('refuses a future issue date and an expiry on or before the issue date', () => {
    const [y, m, d] = todayIso().split('-').map(Number);
    const tomorrow = todayIso(new Date(y, m - 1, d + 1));
    expect(errorsFor(certificationsSchema, row, { issue_date: tomorrow, expiry_date: '' }).issue_date).toBe('Issue date cannot be in the future.');
    expect(errorsFor(certificationsSchema, row, { issue_date: '2022-06-29', expiry_date: '2022-06-29' }).expiry_date).toBe('Expiry date must be after the issue date.');
  });
  it('saves the order as a number and an empty skills list as null', () => {
    const out = normalizeForm(certificationsSchema, { ...buildForm(certificationsSchema, row), order_index: 3, skills_covered: [] });
    expect(out.order_index).toBe(3); expect(out.skills_covered).toBeNull();
  });
  it('flags featured and expired certificates and shows the badge before the logo', () => {
    const card = certificationsSchema.card({ ...row, is_featured: true, expiry_date: '2020-01-01', badge_image_url: 'b.png', issuer_logo_url: 'l.png' });
    expect(card.flags).toEqual(['featured', 'expired']);
    expect(card.image).toBe('b.png');
    expect(certificationsSchema.card({ ...row, expiry_date: '2999-01-01', badge_image_url: null, issuer_logo_url: 'l.png' }).image).toBe('l.png');
    expect(cardFlags(certificationsSchema, { ...row, status: 'archived' }, certificationsSchema.card(row))).toContain('hidden');
  });
  it('orders featured first, then by order number, then the latest issue', () => {
    const rows = [{ id: 1, issue_date: '2024-01-01' }, { id: 2, order_index: 1, issue_date: '2019-01-01' }, { id: 3, is_featured: true, issue_date: '2018-01-01' }, { id: 4, issue_date: '2025-01-01' }];
    expect(sortRows(certificationsSchema, rows).map((r) => r.id)).toEqual([3, 2, 4, 1]);
  });
  it('stores its three files in certification-badges under the classic folders', () => {
    const form = { issuer: 'Amazon Web Services', title: 'AWS Solutions Architect' };
    expect(issuerLogoUpload.path({ form, stamp: 2, ext: 'png' })).toBe('issuer_logos/issuer-logo-amazon-web-services-2.png');
    expect(badgeUpload.path({ form, stamp: 2, ext: 'png' })).toBe('badges/badge-aws-solutions-architect-2.png');
    expect(certificateFileUpload.path({ form, stamp: 2, ext: 'pdf' })).toBe('certifications/certificate-aws-solutions-architect-2.pdf');
    expect(certificateFileUpload.accept).toEqual(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);
  });
});

describe('achievements', () => {
  const row = liveAchievements[0];
  it('covers every achievement column and the classic positions', () => {
    expect(keys(achievementsSchema)).toEqual(['achievement_number', 'category', 'certificate_url', 'competition_name', 'date_achieved', 'description', 'impact', 'is_featured', 'issuing_organization', 'order_index', 'participants_count', 'position', 'status', 'title', 'verification_url']);
    expect(POSITIONS).toHaveLength(28);
  });
  it('takes an issuing organization or a competition, never both, and neither is required', () => {
    const both = errorsFor(achievementsSchema, row, { issuing_organization: 'IEEE', competition_name: 'Hackathon' });
    expect(both).toEqual({ issuing_organization: 'Give an issuing organization or a competition name, not both.', competition_name: 'Give an issuing organization or a competition name, not both.' });
    expect(errorsFor(achievementsSchema, row, { issuing_organization: '', competition_name: '' })).toEqual({});
    expect(errorsFor(achievementsSchema, row, { issuing_organization: '  ', competition_name: 'Hackathon' })).toEqual({});
  });
  it('keeps live categories and positions outside the lists, and refuses future dates', () => {
    expect(errorsFor(achievementsSchema, row, { category: 'Appointment Letter', position: 'Joint Secretary' })).toEqual({});
    expect(errorsFor(achievementsSchema, row, { date_achieved: '2999-01-01' }).date_achieved).toBe('Date achieved cannot be in the future.');
  });
  it('offers no Word files (achievement-images refuses them) and names the certificate after the title', () => {
    expect(achievementCertificateUpload.accept.some((t) => /word|msword/.test(t))).toBe(false);
    expect(achievementCertificateUpload.path({ form: { title: 'First Prize – Techlikith' }, stamp: 3, ext: 'pdf' })).toBe('certificates/first-prize-techlikith-certificate-3.pdf');
  });
  it('shows who awarded it and its rank on the card', () => {
    expect(achievementsSchema.card({ title: 'Star', issuing_organization: null, competition_name: 'IIoT Expo', date_achieved: '2019-05-20', category: 'Competition Winner', position: 'Second Place', is_featured: true })).toEqual({ title: 'Star', subtitle: 'IIoT Expo · May 2019', chips: ['Competition Winner', 'Second Place'], image: null, flags: ['featured'] });
  });
});

describe('leadership', () => {
  const row = liveLeadership[0];
  it('covers every leadership column and uploads nothing', () => {
    expect(keys(leadershipSchema)).toEqual(['achievements', 'budget_managed', 'challenges_overcome', 'description', 'end_date', 'impact', 'initiative_type', 'is_current', 'is_featured', 'key_responsibilities', 'location', 'mentees_count', 'organization', 'organization_type', 'position_number', 'recognition_received', 'skills_developed', 'start_date', 'status', 'team_size', 'title', 'training_provided', 'volunteer_hours']);
    expect(leadershipSchema.cleanup).toBeUndefined();
  });
  it('clears the end date for a current role and checks it otherwise', () => {
    expect(applyChange(leadershipSchema, buildForm(leadershipSchema, { ...row, end_date: '2024-01-01' }), 'is_current', true).end_date).toBe('');
    expect(errorsFor(leadershipSchema, { ...row, is_current: false }, { start_date: '2024-01-02', end_date: '2024-01-01' }).end_date).toBe('End date must be after the start date.');
    expect(errorsFor(leadershipSchema, row, { volunteer_hours: -1 }).volunteer_hours).toBe('Volunteer hours must be at least 0.');
  });
  it('orders featured first, then the latest start, and flags current roles', () => {
    const rows = [{ id: 1, start_date: '2025-09-02' }, { id: 2, is_featured: true, start_date: '2020-01-01' }, { id: 3, start_date: '2026-01-01' }];
    expect(sortRows(leadershipSchema, rows).map((r) => r.id)).toEqual([2, 3, 1]);
    expect(leadershipSchema.card({ title: 'Lead', organization: 'NYU', is_current: true, is_featured: true, start_date: '2025-09-02' }).flags).toEqual(['featured', 'current']);
  });
});

describe('recommendations', () => {
  const row = liveRecommendations[0];
  it('covers every recommendation column, with the word count derived', () => {
    expect(keys(recommendationsSchema)).toEqual(['content', 'date_received', 'is_featured', 'is_public', 'linkedin_profile_url', 'order_index', 'organization', 'profile_image_url', 'rating', 'recommendation_number', 'recommendation_type', 'recommender_name', 'recommender_title', 'relationship', 'status', 'word_count']);
    expect(normalizeForm(recommendationsSchema, { ...buildForm(recommendationsSchema, row), content: '  Hard working,  kind\nand sharp. ' }).word_count).toBe(5);
    expect(countWords('')).toBe(0);
    liveRecommendations.forEach((r) => expect(countWords(r.content)).toBe(r.word_count));
  });
  it('is public only while active and marked public', () => {
    expect(isPublic(recommendationsSchema, { status: 'active', is_public: true })).toBe(true);
    expect(isPublic(recommendationsSchema, { status: 'active', is_public: false })).toBe(false);
    expect(isPublic(recommendationsSchema, { status: 'draft', is_public: true })).toBe(false);
    expect(cardFlags(recommendationsSchema, { ...row, is_public: false }, recommendationsSchema.card(row))).toContain('hidden');
  });
  it('accepts only LinkedIn profile links, adding https to a bare one', () => {
    expect(errorsFor(recommendationsSchema, row, { linkedin_profile_url: 'linkedin.com/in/jane-doe' })).toEqual({});
    expect(normalizeForm(recommendationsSchema, { ...buildForm(recommendationsSchema, row), linkedin_profile_url: 'www.linkedin.com/in/jane-doe/' }).linkedin_profile_url).toBe('https://www.linkedin.com/in/jane-doe/');
    expect(errorsFor(recommendationsSchema, row, { linkedin_profile_url: 'https://linkedin.com/company/acme' }).linkedin_profile_url).toBe('LinkedIn profile must look like https://linkedin.com/in/name.');
  });
  it('rates from 1 to 5, needs the text, and caps it at 8000 characters', () => {
    expect(errorsFor(recommendationsSchema, row, { rating: 6 }).rating).toBe('Rating must be from 1 to 5.');
    expect(errorsFor(recommendationsSchema, row, { content: ' ' }).content).toBe('Recommendation is required.');
    expect(errorsFor(recommendationsSchema, row, { content: 'x'.repeat(8001) }).content).toBe('Recommendation is over 8000 characters.');
  });
  it('orders featured first, then newest added; keeps the photo path and shows relationship and rating', () => {
    const rows = [{ id: 1, created_at: '2025-06-05' }, { id: 2, created_at: '2025-06-01', is_featured: true }, { id: 3, created_at: '2025-06-09' }];
    expect(sortRows(recommendationsSchema, rows).map((r) => r.id)).toEqual([2, 3, 1]);
    expect(recommenderPhotoUpload.path({ form: { recommender_name: 'Neha Chopra' }, stamp: 4, ext: 'jpg' })).toBe('profile-images/neha-chopra-profile-4.jpg');
    expect(recommendationsSchema.card({ recommender_name: 'Neha', relationship: 'Client', rating: 5 }).chips).toEqual(['Client', '5/5']);
  });
});

describe('section kit', () => {
  it('writes month ranges for cards', () => {
    expect(monthYear('2021-08-05')).toBe('Aug 2021'); expect(monthYear('2021-13-01')).toBe(''); expect(monthYear(null)).toBe('');
    expect(dateRange('2021-08-05', '2024-07-03')).toBe('Aug 2021 to Jul 2024');
    expect(dateRange('2021-08-05', null, true)).toBe('Aug 2021 to now');
    expect(dateRange('2021-08-05', '2021-08-30')).toBe('Aug 2021');
    expect(dateRange('2021-08-05', null)).toBe('Aug 2021');
    expect(dateRange(null, '2024-07-03')).toBe('Until Jul 2024');
    expect(dateRange(null, null)).toBe('');
  });
  it('tells past dates in the local calendar', () => {
    expect(isPast('2020-01-01', '2026-11-18')).toBe(true);
    expect(isPast('2026-11-18', '2026-11-18')).toBe(false);
    expect(isPast(null, '2026-11-18')).toBe(false);
  });
  it('orders by order number with unset last, then the newest date, then the newest created', () => {
    const cmp = featuredFirst(orderThenDate('d'));
    const rows = [{ id: 'a', d: '2020' }, { id: 'b', d: '2020', created_at: '2021' }, { id: 'c', order_index: 0 }, { id: 'd', is_featured: true, order_index: 9 }];
    expect([...rows].sort(cmp).map((r) => r.id)).toEqual(['d', 'c', 'b', 'a']);
  });
});
