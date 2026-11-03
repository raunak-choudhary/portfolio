#!/usr/bin/env node
// scripts/static-server.mjs
//
// Serves the production build for the browser suite, the way Hostinger will:
//   - existing files are served as-is with a content type from their extension;
//   - any other path falls back to index.html (single-page app routing);
//   - response headers come from public/.htaccess (see htaccess-headers.mjs).
//
// Usage: node scripts/static-server.mjs [--root build] [--port 4173] [--htaccess public/.htaccess]
// Binds to localhost only. No dependencies beyond Node's standard library.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { headersForFile, parseHtaccessHeaders } from './lib/htaccess-headers.mjs';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** Reads `--name value` pairs from argv with defaults. */
function readOptions(argv) {
  const options = { root: 'build', port: 4173, htaccess: 'public/.htaccess' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (key in options) options[key] = key === 'port' ? Number(argv[i + 1]) : argv[i + 1];
  }
  return options;
}

/**
 * Maps a request URL to a file under root, refusing anything that escapes it.
 * @returns {string|null} absolute file path, or null for traversal attempts.
 */
export function resolveRequestPath(root, requestUrl) {
  const { pathname } = new URL(requestUrl, 'http://localhost');
  const decoded = decodeURIComponent(pathname);
  const absoluteRoot = path.resolve(root);
  const candidate = path.resolve(absoluteRoot, `.${decoded}`);
  if (candidate !== absoluteRoot && !candidate.startsWith(absoluteRoot + path.sep)) {
    return null;
  }
  return candidate;
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function start({ root, port, htaccess }) {
  const rules = existsSync(htaccess) ? parseHtaccessHeaders(readFileSync(htaccess, 'utf8')) : [];
  const indexPath = path.resolve(root, 'index.html');

  const server = createServer(async (request, response) => {
    try {
      const requested = resolveRequestPath(root, request.url);
      if (requested === null) {
        response.writeHead(400).end('Bad request');
        return;
      }

      const filePath = (await isFile(requested)) ? requested : indexPath;
      const body = await readFile(filePath);
      const extension = path.extname(filePath).toLowerCase();

      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[extension] || 'application/octet-stream',
        ...headersForFile(rules, path.basename(filePath)),
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      response.writeHead(500).end('Internal error');
      process.stderr.write(`static-server: ${error.message}\n`);
    }
  });

  server.listen(port, 'localhost', () => {
    process.stdout.write(`static-server: serving ${root} on http://localhost:${port} (${rules.length} header rules)\n`);
  });
}

// Run only when executed directly, so tests can import resolveRequestPath.
if (import.meta.url === `file://${process.argv[1]}`) {
  start(readOptions(process.argv.slice(2)));
}
