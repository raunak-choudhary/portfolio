// src/components/admin/Voyage/TonightTile.js
//
// The Bento "Tonight" tile: the Moon as New York sees it right now, painted
// from the real maps with moonPicture.js, its lit share, the phase, and one
// line for New York (which way the lit side leans from straight up, or when
// it rises). Refreshes on the minute. The maps are the 3D Moon's 1024 px
// pair, fetched after the page is idle and kept small for the tile.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Moon } from 'lucide-react';
import { moonTonight, tiltWords } from './moonModel';
import { paintMoon } from './moonPicture';
import { clockIn } from './earthModel';

const ZONE = 'America/New_York';
/** The disc's CSS size, matching .tile__moon. */
export const MOON_TILE_PX = 56;
/** The maps are read at this width: the disc is at most 168 device pixels, about a third of the visible hemisphere's 256. */
const MAP_WIDTH = 512;

const dayMonth = (date) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: ZONE }).format(date);
const degreesInWords = (text) => text.replace(/°/g, ' degrees');

/**
 * The tile's words for a moment.
 * @param {ReturnType<typeof moonTonight>} t
 * @returns {{percent: string, phaseLine: string, newYorkLine: string, label: string}}
 */
export function tonightText(t) {
  const percent = `${Math.round(t.fraction * 100)}%`;
  const phase = /waxing|waning/.test(t.phase) || t.phase.includes('moon') ? t.phase : `${t.waxing ? 'waxing' : 'waning'} · ${t.phase}`;
  const next = t.nextFull < t.nextNew ? `full ${dayMonth(t.nextFull)}` : `new ${dayMonth(t.nextNew)}`;
  const phaseLine = `${phase} · ${next}`;
  const where = t.up ? tiltWords(t.tilt) : t.rise ? `below the horizon until ${clockIn(t.rise, ZONE)}` : 'below the horizon';
  const newYorkLine = `from New York · ${where}`;
  const lean = degreesInWords(tiltWords(t.tilt));
  const label = t.up
    ? `The Moon from New York: ${percent} lit, ${t.phase}, ${lean}.`
    : `The Moon from New York: ${percent} lit, ${t.phase}, ${where}; at moonrise its ${lean.replace(/^lit side /, 'lit side is ')}.`;
  return { percent, phaseLine, newYorkLine, label };
}

/** Decode one map to small RGBA pixels, or null where images do not load (tests, a failed fetch). */
function readMap(url) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve(null); return; }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = MAP_WIDTH; canvas.height = MAP_WIDTH / 2;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Run once the page has settled, so the tile's maps never compete with the first paint. */
const whenIdle = (fn) => {
  if (typeof window.requestIdleCallback === 'function') { const id = window.requestIdleCallback(fn, { timeout: 4000 }); return () => window.cancelIdleCallback(id); }
  const id = setTimeout(fn, 1500); return () => clearTimeout(id);
};

const wallClock = () => new Date();

/**
 * @param {{assetBase: string, now?: () => Date}} props now is for tests.
 */
export default function TonightTile({ assetBase, now = wallClock }) {
  const canvasRef = useRef(null);
  const [at, setAt] = useState(now);
  const [maps, setMaps] = useState(null);

  // tick on the minute
  useEffect(() => {
    let timer;
    const schedule = () => { const t = now(); timer = setTimeout(() => { setAt(now()); schedule(); }, 60000 - (t.getTime() % 60000) + 50); };
    schedule();
    return () => clearTimeout(timer);
  }, [now]);

  useEffect(() => {
    let live = true;
    const cancel = whenIdle(() => {
      Promise.all([readMap(`${assetBase}moon/moon-color-1024.webp`), readMap(`${assetBase}moon/moon-relief-1024.webp`)])
        .then(([albedo, relief]) => { if (live && (albedo || relief)) setMaps({ albedo, relief }); });
    });
    return () => { live = false; cancel(); };
  }, [assetBase]);

  const moon = useMemo(() => moonTonight(at), [at]);
  const text = useMemo(() => tonightText(moon), [moon]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.('2d');
    if (!ctx) return;
    // drawn at the screen's own resolution, so the disc is crisp at 1x, 2x and 3x
    const size = Math.round(MOON_TILE_PX * Math.min(4, Math.max(1, window.devicePixelRatio || 1)));
    if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
    const image = ctx.createImageData(size, size);
    if (image?.data?.length !== size * size * 4) return;   // a stand-in context (tests) with no pixels to paint
    paintMoon(image.data, size, moon, maps || {});
    ctx.putImageData(image, 0, 0);
  }, [moon, maps]);

  return (
    <>
      <h5><Moon size={14} /> Tonight</h5>
      <div className="tile__row">
        <canvas ref={canvasRef} className="tile__moon" role="img" aria-label={text.label} data-testid="tonight-moon" />
        <div>
          <div className="tile__big">{text.percent}</div>
          <div className="tile__muted">{text.phaseLine}</div>
          <div className="tile__muted" data-testid="tonight-new-york">{text.newYorkLine}</div>
        </div>
      </div>
    </>
  );
}
