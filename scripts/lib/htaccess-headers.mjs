// scripts/lib/htaccess-headers.mjs
//
// Extracts the response headers an Apache or LiteSpeed server would add from
// the `Header set` / `Header always set` directives in an .htaccess file.
//
// The browser suite serves the built site with a tiny Node server instead of
// Hostinger. Reading the headers from the same `public/.htaccess` that ships
// in the build keeps a single source of truth: the policy the tests exercise
// is the policy production sends.
//
// Only the subset of mod_headers syntax this project uses is supported:
// `Header [always] set|append <Name> "<value>"` with a double-quoted or bare
// single-token value. Conditional blocks are flattened: a header inside
// <IfModule mod_headers.c> or <FilesMatch> is treated as global, except that
// headers inside a <FilesMatch "..."> block are returned with that pattern so
// the server can apply them per file.

const DIRECTIVE = /^\s*Header\s+(?:always\s+)?(set|append)\s+([A-Za-z0-9-]+)\s+(?:"((?:[^"\\]|\\.)*)"|(\S+))/i;
const FILES_MATCH_OPEN = /^\s*<FilesMatch\s+"([^"]+)"\s*>/i;
const FILES_MATCH_CLOSE = /^\s*<\/FilesMatch>/i;

/**
 * Parses header directives from .htaccess text.
 *
 * @param {string} text contents of an .htaccess file.
 * @returns {{ name: string, value: string, mode: 'set'|'append', filesMatch: RegExp|null }[]}
 *   directives in file order. Comment lines are ignored.
 */
export function parseHtaccessHeaders(text) {
  const rules = [];
  let filesMatch = null;

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const open = FILES_MATCH_OPEN.exec(line);
    if (open) {
      filesMatch = new RegExp(open[1]);
      continue;
    }
    if (FILES_MATCH_CLOSE.test(line)) {
      filesMatch = null;
      continue;
    }

    const match = DIRECTIVE.exec(line);
    if (!match) continue;

    const [, mode, name, quoted, bare] = match;
    const value = quoted !== undefined ? quoted.replace(/\\"/g, '"') : bare;
    rules.push({ name, value, mode: mode.toLowerCase(), filesMatch });
  }

  return rules;
}

/**
 * Resolves the headers that apply to one served file.
 *
 * Later `set` directives replace earlier ones for the same header name, as in
 * Apache; `append` adds a comma-separated value.
 *
 * @param {ReturnType<typeof parseHtaccessHeaders>} rules parsed directives.
 * @param {string} fileName base name of the file being served, e.g. "index.html".
 * @returns {Record<string, string>} header name to value.
 */
export function headersForFile(rules, fileName) {
  const headers = {};
  for (const rule of rules) {
    if (rule.filesMatch && !rule.filesMatch.test(fileName)) continue;
    const key = rule.name;
    if (rule.mode === 'append' && headers[key]) {
      headers[key] = `${headers[key]}, ${rule.value}`;
    } else {
      headers[key] = rule.value;
    }
  }
  return headers;
}
