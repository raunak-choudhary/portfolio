// src/utils/resumeLink.js
//
// The resume button on the public site points only at the portfolio's own
// storage: a PDF under documents/resume/ in this project's public bucket. The
// database refuses any other value (migration 20261121150000); this repeats
// the test in the browser so an old or hand-edited row can never turn the
// button into a link to somewhere else. Anything that fails gives null, and
// the button is simply not shown.

const RESUME_PATH = /^\/storage\/v1\/object\/public\/documents\/resume\/[A-Za-z0-9._-]+\.pdf$/;

/**
 * @param {unknown} value the hero row's resume_url
 * @param {string} [projectUrl] this site's Supabase address (REACT_APP_SUPABASE_URL)
 * @returns {string|null} the link, or null when it is missing or not ours
 */
export function safeResumeUrl(value, projectUrl = process.env.REACT_APP_SUPABASE_URL) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 500) return null;
  let link;
  let project;
  try {
    link = new URL(value);
    project = new URL(projectUrl || '');
  } catch {
    return null;
  }
  if (link.protocol !== 'https:' || link.origin !== project.origin) return null;
  if (link.search || link.hash || !RESUME_PATH.test(link.pathname)) return null;
  return link.href;
}

export default safeResumeUrl;
