import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAssetUrl, collectAssetHosts } from './asset-hosts.mjs';

describe('classifyAssetUrl', () => {
  it('recognises images and documents by extension, case-insensitively', () => {
    assert.equal(classifyAssetUrl('https://cdn.example/icons/react.svg'), 'image');
    assert.equal(classifyAssetUrl('https://cdn.example/photo.JPG?w=1'), 'image');
    assert.equal(classifyAssetUrl('https://files.example/cert.pdf'), 'document');
  });

  it('treats Supabase storage objects as images even without an extension', () => {
    assert.equal(classifyAssetUrl('https://p.supabase.co/storage/v1/object/public/logos/acme'), 'image');
  });

  it('ignores plain links and malformed URLs', () => {
    assert.equal(classifyAssetUrl('https://github.com/raunak-choudhary/tallyproof'), null);
    assert.equal(classifyAssetUrl('https://www.coursera.org/verify/ABC'), null);
    assert.equal(classifyAssetUrl('not a url'), null);
  });
});

describe('collectAssetHosts', () => {
  it('gathers hosts from source text and nested fixture values, by kind', () => {
    const hosts = collectAssetHosts({
      sources: ['src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg"'],
      fixtures: [
        { badge_image_url: 'https://p.supabase.co/storage/v1/object/public/badges/aws.png', links: ['https://github.com/x'] },
        { certificate_pdf_url: 'https://p.supabase.co/storage/v1/object/public/certs/aws.pdf' },
        { nested: { deeper: [{ icon: 'https://icons.example/go.png' }] } },
      ],
    });

    assert.deepEqual([...hosts.image].sort(), ['cdn.jsdelivr.net', 'icons.example', 'p.supabase.co']);
    assert.deepEqual([...hosts.document], ['p.supabase.co']);
  });

  it('returns empty sets for empty input', () => {
    const hosts = collectAssetHosts({});
    assert.equal(hosts.image.size, 0);
    assert.equal(hosts.document.size, 0);
  });
});
