// scripts/lib/asset-hosts.mjs
//
// Finds every external host the site loads assets from, so the Content
// Security Policy can be checked against reality instead of memory.
//
// Two sources are scanned:
//   - component source files, for hard-coded asset URLs (skill icons come
//     from a CDN, for example);
//   - the recorded fixtures, for asset URLs stored in the database (logos,
//     badges, certificates, project screenshots).
//
// A URL counts as an asset when its path ends in an image or document
// extension, or when it is a Supabase storage object. Plain links (GitHub,
// LinkedIn, credential pages) are navigation, not assets, and are ignored.

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'avif'];
const DOCUMENT_EXTENSIONS = ['pdf'];
const URL_PATTERN = /https?:\/\/[^\s"'`<>)]+/g;

/**
 * Classifies one URL.
 * @returns {'image'|'document'|null} asset kind, or null for a plain link.
 */
export function classifyAssetUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const extension = parsed.pathname.split('.').pop()?.toLowerCase() ?? '';
  const isStorageObject = parsed.pathname.includes('/storage/v1/object/');

  if (IMAGE_EXTENSIONS.includes(extension)) return 'image';
  if (DOCUMENT_EXTENSIONS.includes(extension)) return 'document';
  // Storage objects without a recognisable extension are treated as images,
  // the common case for uploaded logos and photos.
  if (isStorageObject) return 'image';
  return null;
}

/** Walks any JSON value and yields every string inside it. */
function* strings(value) {
  if (typeof value === 'string') {
    yield value;
  } else if (Array.isArray(value)) {
    for (const item of value) yield* strings(item);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) yield* strings(item);
  }
}

/**
 * Collects asset hosts.
 *
 * @param {{ sources?: string[], fixtures?: unknown[] }} input
 *   `sources` are file contents; `fixtures` are parsed fixture rows.
 * @returns {{ image: Set<string>, document: Set<string> }} hosts by kind.
 */
export function collectAssetHosts({ sources = [], fixtures = [] }) {
  const hosts = { image: new Set(), document: new Set() };

  const consider = (url) => {
    const kind = classifyAssetUrl(url);
    if (kind) hosts[kind].add(new URL(url).host);
  };

  for (const text of sources) {
    for (const match of String(text).matchAll(URL_PATTERN)) consider(match[0]);
  }
  for (const fixture of fixtures) {
    for (const text of strings(fixture)) {
      for (const match of text.matchAll(URL_PATTERN)) consider(match[0]);
    }
  }

  return hosts;
}
