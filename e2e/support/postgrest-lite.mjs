// e2e/support/postgrest-lite.mjs
//
// Just enough PostgREST behaviour for the admin browser tests to answer
// supabase-js reads and writes from hand-written fixtures. Pure functions
// only, unit tested in postgrest-lite.test.mjs.
//
// Supported query parameters: column filters with eq, neq, is, in, gt, gte,
// lt, lte; `order` (first column only), `limit`, `offset`, and `or` is
// ignored (it only narrows, so ignoring it returns a superset). `select` is
// ignored: fixtures carry the columns the screens read. Anything else is
// ignored too, which is the safe direction for a fixture layer: a screen may
// see more rows than the real database would return, never a write.

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'or', 'and', 'on_conflict', 'columns']);

/** Strips PostgREST quoting from a literal: "a,b" -> a,b. */
const unquote = (text) => (text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text);

/** Compares a row value with a filter literal the way the text form would. */
function matches(value, operator, literal) {
  const text = value === null || value === undefined ? null : String(value);
  switch (operator) {
    case 'eq': return text !== null && text.toLowerCase() === literal.toLowerCase();
    case 'neq': return text === null || text.toLowerCase() !== literal.toLowerCase();
    case 'is':
      if (literal === 'null') return text === null;
      if (literal === 'true' || literal === 'false') return text === literal;
      return true;
    case 'in': {
      const list = literal.replace(/^\(|\)$/g, '').split(',').map((item) => unquote(item.trim()).toLowerCase());
      return text !== null && list.includes(text.toLowerCase());
    }
    case 'gt': return text !== null && text > literal;
    case 'gte': return text !== null && text >= literal;
    case 'lt': return text !== null && text < literal;
    case 'lte': return text !== null && text <= literal;
    default: return true;
  }
}

/**
 * Applies the filter parameters of a PostgREST URL to fixture rows.
 * @param {object[]} rows
 * @param {URLSearchParams} params
 * @returns {object[]} the matching rows (filters only, no order or paging).
 */
export function filterRows(rows, params) {
  let result = rows;
  for (const [column, expression] of params.entries()) {
    if (RESERVED.has(column)) continue;
    const match = /^(not\.)?([a-z]+)\.(.*)$/s.exec(expression);
    if (!match) continue;
    const [, negated, operator, literal] = match;
    result = result.filter((row) => {
      if (!(column in row)) return true; // unknown column: do not narrow
      const hit = matches(row[column], operator, literal);
      return negated ? !hit : hit;
    });
  }
  return result;
}

/** Applies `order`, `offset` and `limit`. */
export function pageRows(rows, params) {
  let result = [...rows];
  const order = params.get('order');
  if (order) {
    const [column, direction = 'asc'] = order.split(',')[0].split('.');
    const sign = direction === 'desc' ? -1 : 1;
    result.sort((a, b) => {
      const x = a[column], y = b[column];
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (x > y ? 1 : -1) * sign;
    });
  }
  const offset = Number(params.get('offset') || 0);
  const limit = params.has('limit') ? Number(params.get('limit')) : Infinity;
  return result.slice(offset, offset + limit);
}

/**
 * Builds a PostgREST-shaped response for a read.
 * @param {object[]} rows all fixture rows of the table.
 * @param {{ method: string, url: string, accept?: string, prefer?: string }} request
 */
export function readResponse(rows, { method, url, accept = '', prefer = '' }) {
  const params = new URL(url).searchParams;
  const filtered = filterRows(rows, params);
  const page = pageRows(filtered, params);
  const headers = { 'content-type': 'application/json; charset=utf-8' };
  if (/count=(exact|planned|estimated)/.test(prefer)) {
    const offset = Number(params.get('offset') || 0);
    headers['content-range'] = page.length ? `${offset}-${offset + page.length - 1}/${filtered.length}` : `*/${filtered.length}`;
  }
  if (method === 'HEAD') return { status: 200, headers, body: '' };
  if (accept.includes('application/vnd.pgrst.object+json')) {
    if (page.length !== 1) {
      return { status: 406, headers, body: JSON.stringify({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${page.length} rows` }) };
    }
    return { status: 200, headers, body: JSON.stringify(page[0]) };
  }
  return { status: 200, headers, body: JSON.stringify(page) };
}

/**
 * Applies a write to fixture rows and returns the new table and the rows the
 * write touched, so the intercept can answer `return=representation`.
 * @param {object[]} rows
 * @param {{ method: 'POST'|'PATCH'|'DELETE', url: string, body: unknown, now?: string }} write
 */
export function applyWrite(rows, { method, url, body, now = new Date().toISOString() }) {
  const params = new URL(url).searchParams;
  if (method === 'POST') {
    const inserted = (Array.isArray(body) ? body : [body]).map((row, index) => ({
      id: row.id ?? `TEST-new-${Date.now()}-${index}`,
      created_at: now,
      updated_at: now,
      ...row,
    }));
    return { rows: [...rows, ...inserted], touched: inserted };
  }
  const target = new Set(filterRows(rows, params));
  if (method === 'PATCH') {
    const touched = [];
    const next = rows.map((row) => {
      if (!target.has(row)) return row;
      const updated = { ...row, ...body, updated_at: body?.updated_at ?? now };
      touched.push(updated);
      return updated;
    });
    return { rows: next, touched };
  }
  if (method === 'DELETE') {
    return { rows: rows.filter((row) => !target.has(row)), touched: [...target] };
  }
  return { rows, touched: [] };
}

/** Builds the response for a write, honouring Prefer: return=representation and .single(). */
export function writeResponse(touched, { method, accept = '', prefer = '' }) {
  const headers = { 'content-type': 'application/json; charset=utf-8' };
  if (!/return=representation/.test(prefer)) return { status: method === 'POST' ? 201 : 204, headers, body: '' };
  if (accept.includes('application/vnd.pgrst.object+json')) {
    if (touched.length !== 1) return { status: 406, headers, body: JSON.stringify({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }) };
    return { status: method === 'POST' ? 201 : 200, headers, body: JSON.stringify(touched[0]) };
  }
  return { status: method === 'POST' ? 201 : 200, headers, body: JSON.stringify(touched) };
}
