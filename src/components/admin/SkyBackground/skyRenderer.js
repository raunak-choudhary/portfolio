// src/components/admin/SkyBackground/skyRenderer.js
//
// Canvas renderer for the zodiac sky. Two layers: a "sky" canvas painted
// only when the theme or size changes (gradient and background stars), and a
// "live" canvas repainted each frame (Sun or Moon, clouds, figures). It knows
// nothing about React: SkyBackground.js owns the canvases, the frame loop and
// the settings, and calls into the object returned by createSkyRenderer.
//
// Images: the eighteen atlas drawings, the fallback Sun and the Moon come from
// public/admin/sky (same origin). The live Sun is NASA SDO's latest image,
// loaded as a plain <img> from sdo.gsfc.nasa.gov and drawn clipped to the
// disc; no pixel data is ever read from it, so the cross-origin load needs no
// CORS and cannot taint anything.

import {
  ZODIAC_IDS, FIGURE_TIMING, figureProgress, lampPosition, moonPhase, planClouds, planTiles, seededRandom,
} from './skyModel';

/** NASA SDO latest 30.4 nm image; a new one roughly every 15 minutes. */
export const LIVE_SUN_URL = 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0304.jpg';
export const LIVE_SUN_REFRESH_MS = 15 * 60 * 1000;
/** Disc centre and radius inside the SDO image, as fractions of its width. */
const SUN_LIVE = { cx: 0.5, cy: 0.5, r: 0.40 };
/** Disc centre and radius inside the archived fallback image (600 x 573). */
const SUN_FALLBACK = { cx: 303, cy: 287, r: 233 };

const TAU = Math.PI * 2;

/** Colours per theme. Rust is the only day colour, by the owner's choice. */
const PALETTES = {
  light: {
    line: 'rgba(156,59,18,0.95)', lineSoft: 'rgba(156,59,18,0.55)', dot: '156,59,18', glow: 'rgba(156,59,18,',
    name: '#6e2a0c', art: '#9c3b12', artAlpha: 0.38, cloud: 1.0, bgStar: 'rgba(120,60,30,', glowCore: 0.22,
    sky: [['0', '#5aa7e8'], ['0.6', '#8ec5f0'], ['1', '#cfe6f8']],
  },
  dark: {
    line: 'rgba(190,210,255,0.8)', lineSoft: 'rgba(190,210,255,0.35)', dot: '255,255,255', glow: 'rgba(200,220,255,',
    name: 'rgba(210,224,248,0.92)', art: '#a9c0ee', artAlpha: 0.30, cloud: 0.5, bgStar: 'rgba(255,255,255,', glowCore: 0.45,
    sky: [['0', '#02040c'], ['0.7', '#060c1c'], ['1', '#0d1830']],
  },
};

/**
 * A cumulus: many soft puffs piled on a flatter base, shaded underneath.
 * Built once per kind on an offscreen canvas and reused.
 */
function makeCloudSprite(doc, seed, kind) {
  const c = doc.createElement('canvas');
  c.width = 640; c.height = 320;
  const g = c.getContext('2d');
  if (!g) return c;
  const rnd = seededRandom(seed);
  const n = kind === 'big' ? 90 : kind === 'mid' ? 55 : 28, spread = kind === 'big' ? 1 : kind === 'mid' ? 0.75 : 0.5;
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const u = rnd(), v = rnd();
    const x = 320 + (u - 0.5) * 460 * spread;
    const lift = Math.sin(u * Math.PI) * (0.6 + 0.4 * Math.sin(u * 9 + seed));
    const y = 215 - v * v * 150 * lift * spread;
    const r = (14 + rnd() * 34) * (0.7 + 0.6 * lift) * spread;
    const grad = g.createRadialGradient(x - r * 0.15, y - r * 0.2, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.28)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.12)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.globalCompositeOperation = 'destination-in';
  const base = g.createLinearGradient(0, 200, 0, 250); base.addColorStop(0, 'rgba(0,0,0,1)'); base.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = base; g.fillRect(0, 0, 640, 320);
  g.globalCompositeOperation = 'source-atop';
  const shade = g.createLinearGradient(0, 120, 0, 250); shade.addColorStop(0, 'rgba(140,160,190,0)'); shade.addColorStop(1, 'rgba(140,160,190,0.45)');
  g.fillStyle = shade; g.fillRect(0, 0, 640, 320);
  return c;
}

/**
 * @param {object} input
 * @param {HTMLCanvasElement} input.skyCanvas the background layer.
 * @param {HTMLCanvasElement} input.liveCanvas the animated layer.
 * @param {Array} input.figures figures from figures.json.
 * @param {string} input.assetBase URL prefix for the sky assets, e.g. "/admin/sky/".
 * @param {Document} [input.doc] document used to create images and offscreen canvases (injectable for tests).
 * @param {boolean} [input.liveSun] whether to load NASA's live Sun (off in tests).
 */
export function createSkyRenderer({ skyCanvas, liveCanvas, figures, assetBase, doc = document, liveSun = true }) {
  const skyCtx = skyCanvas.getContext('2d'), ctx = liveCanvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, theme = 'dark';
  let settings = { drawings: true, clouds: true, motion: true };
  let tiles = [], clouds = [], bgStars = [];
  const start = Date.now();
  let liveSunImage = null, liveSunStamp = 0, liveSunTimer = null;
  let lastNow = 0;   // the animation clock, kept monotonic (see frame)

  // ---- images ------------------------------------------------------------
  const images = new Map();   // figure id -> HTMLImageElement once loaded
  const tinted = new Map();   // "id|colour" -> tinted offscreen canvas
  const loadImage = (src, onload) => { const img = new Image(); img.decoding = 'async'; img.onload = () => onload(img); img.src = src; return img; };
  for (const fig of figures) if (fig.art) loadImage(`${assetBase}art/${fig.art.file}`, (img) => { images.set(fig.id, img); tinted.clear(); });
  let sunFallback = null, moonImage = null;
  loadImage(`${assetBase}sun-uv.webp`, (img) => { sunFallback = img; });
  loadImage(`${assetBase}moon.webp`, (img) => { moonImage = img; });
  const loadLiveSun = () => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => { liveSunImage = img; liveSunStamp = Date.now(); };
    img.src = `${LIVE_SUN_URL}?t=${Math.floor(Date.now() / LIVE_SUN_REFRESH_MS)}`;
  };
  if (liveSun) { loadLiveSun(); liveSunTimer = setInterval(loadLiveSun, LIVE_SUN_REFRESH_MS); }

  /** The drawing recoloured for the theme: alpha from the sprite, colour from the palette. */
  const tintedArt = (fig, colour) => {
    const key = `${fig.id}|${colour}`;
    if (tinted.has(key)) return tinted.get(key);
    const img = images.get(fig.id);
    if (!img) return null;
    const c = doc.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    const g = c.getContext('2d');
    if (!g) return null;
    g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = colour; g.fillRect(0, 0, c.width, c.height);
    tinted.set(key, c);
    return c;
  };

  // ---- clouds and background stars --------------------------------------
  const sprites = { big: [0, 1, 2].map((i) => makeCloudSprite(doc, 17 + i * 13, 'big')), mid: [0, 1, 2].map((i) => makeCloudSprite(doc, 41 + i * 7, 'mid')), small: [0, 1, 2, 3].map((i) => makeCloudSprite(doc, 71 + i * 5, 'small')) };
  const seedStars = () => { const rnd = seededRandom(7); const n = Math.round((W * H) / 3800); bgStars = Array.from({ length: n }, () => ({ x: rnd(), y: rnd(), r: 0.3 + rnd() * rnd() * 1.6, a: 0.25 + rnd() * 0.6 })); };

  const paintSky = () => {
    if (!skyCtx || !W || !H) return;
    const pal = PALETTES[theme];
    skyCtx.setTransform(dpr, 0, 0, dpr, 0, 0); skyCtx.clearRect(0, 0, W, H);
    const g = skyCtx.createLinearGradient(0, 0, 0, H);
    for (const [stop, colour] of pal.sky) g.addColorStop(Number(stop), colour);
    skyCtx.fillStyle = g; skyCtx.fillRect(0, 0, W, H);
    for (const s of bgStars) { skyCtx.fillStyle = `${pal.bgStar}${theme === 'light' ? s.a * 0.22 : s.a})`; skyCtx.beginPath(); skyCtx.arc(s.x * W, s.y * H, s.r, 0, TAU); skyCtx.fill(); }
  };

  let lastCloud = 0;
  const drawClouds = (now) => {
    const pal = PALETTES[theme], dt = lastCloud ? Math.min(0.1, (now - lastCloud) / 1000) : 0; lastCloud = now;
    for (const c of clouds) {
      if (settings.motion) { c.x += (c.speed * dt) / 10; if (c.x > 1.25) c.x = -0.25; }
      const sprite = sprites[c.kind][c.sprite % sprites[c.kind].length];
      const w = 640 * c.size, h = 320 * c.size;
      ctx.save(); ctx.globalAlpha = c.alpha * pal.cloud; ctx.translate(c.x * W, c.y * H); if (c.flip) ctx.scale(-1, 1); ctx.drawImage(sprite, -w / 2, -h / 2, w, h); ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  // ---- the Sun -----------------------------------------------------------
  // Today's real disc with stylised life around it: prominences rising and
  // sinking on the limb, breathing corona streamers, flares, the odd ejection.
  const srnd = seededRandom(11);
  const prominences = Array.from({ length: 7 }, () => ({ a0: srnd() * TAU, span: 0.10 + srnd() * 0.22, h: 0.06 + srnd() * 0.16, born: -srnd() * 12000, life: 9000 + srnd() * 9000, seed: srnd() * TAU }));
  const flares = Array.from({ length: 3 }, () => ({ born: -1, life: 1, r: 0, a: 0, size: 0.05, next: srnd() * 4000 }));
  const ejecta = [];
  let lastEject = 0;

  const drawSun = (cx, cy, R, now) => {
    const rot = settings.motion ? (now / 420000) * TAU : 0;   // one stylised turn in seven minutes, so the disc is visibly alive
    const glow = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 4.4);
    glow.addColorStop(0, 'rgba(255,160,70,0.55)'); glow.addColorStop(0.3, 'rgba(255,140,60,0.18)'); glow.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = glow; ctx.fillRect(cx - R * 5, cy - R * 5, R * 10, R * 10);
    // corona streamers
    ctx.save(); ctx.translate(cx, cy); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 28; i++) {
      const ang = i * 0.2244 + rot * 0.35;
      const len = R * (1.5 + 0.9 * (0.5 + 0.5 * Math.sin(now / 5000 + i * 1.9)) * (0.6 + 0.4 * Math.sin(i * 2.3)));
      const wdt = R * 0.07 * (0.6 + 0.4 * Math.sin(i * 1.3));
      ctx.save(); ctx.rotate(ang);
      const g = ctx.createLinearGradient(R, 0, len, 0); g.addColorStop(0, 'rgba(255,170,80,0.16)'); g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(R * 0.98, -wdt); ctx.lineTo(len, 0); ctx.lineTo(R * 0.98, wdt); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // the disc: today's SDO image, clipped to the circle, warmed toward orange
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip(); ctx.translate(cx, cy); ctx.rotate(rot);
    if (liveSunImage) {
      const k = (R * 1.015) / (SUN_LIVE.r * liveSunImage.naturalWidth);
      ctx.drawImage(liveSunImage, -SUN_LIVE.cx * liveSunImage.naturalWidth * k, -SUN_LIVE.cy * liveSunImage.naturalHeight * k, liveSunImage.naturalWidth * k, liveSunImage.naturalHeight * k);
    } else if (sunFallback) {
      const k = (R * 1.015) / SUN_FALLBACK.r;
      ctx.drawImage(sunFallback, -SUN_FALLBACK.cx * k, -SUN_FALLBACK.cy * k, sunFallback.naturalWidth * k, sunFallback.naturalHeight * k);
    } else {
      ctx.fillStyle = '#ff7a1a'; ctx.fillRect(-R, -R, R * 2, R * 2);
    }
    ctx.rotate(-rot);
    ctx.globalCompositeOperation = 'color'; ctx.globalAlpha = 0.7; ctx.fillStyle = '#ff8a2a'; ctx.fillRect(-R, -R, R * 2, R * 2);
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.2; ctx.fillStyle = '#ffc070'; ctx.fillRect(-R, -R, R * 2, R * 2);
    // flares: short bright flashes on the disc
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
    for (const f of flares) {
      if (now > f.born + f.life) {
        if (now <= f.next) continue;
        f.born = now; f.life = 1200 + srnd() * 2000; f.r = srnd() * 0.8; f.a = srnd() * TAU; f.size = 0.05 + srnd() * 0.09; f.next = now + f.life + 1500 + srnd() * 5000;
      }
      const t = Math.min(1, Math.max(0, (now - f.born) / f.life)), env = Math.sin(Math.PI * t) ** 1.5;
      const fx = Math.cos(f.a) * f.r * R, fy = Math.sin(f.a) * f.r * R, fr = R * f.size * (0.6 + 0.4 * env);
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
      g.addColorStop(0, `rgba(255,250,220,${0.9 * env})`); g.addColorStop(0.4, `rgba(255,200,110,${0.5 * env})`); g.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = g; ctx.fillRect(fx - fr, fy - fr, fr * 2, fr * 2);
    }
    ctx.restore();
    // limb glow
    const rim = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.18);
    rim.addColorStop(0, 'rgba(255,140,50,0)'); rim.addColorStop(0.45, 'rgba(255,150,60,0.5)'); rim.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(cx, cy, R * 1.2, 0, TAU); ctx.fill();
    // prominences
    ctx.save(); ctx.translate(cx, cy); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const pr of prominences) {
      if (now > pr.born + pr.life) { pr.a0 = srnd() * TAU; pr.span = 0.10 + srnd() * 0.22; pr.h = 0.06 + srnd() * 0.16; pr.born = now; pr.life = 9000 + srnd() * 10000; pr.seed = srnd() * TAU; }
      const t = (now - pr.born) / pr.life, env = Math.max(0, Math.sin(Math.PI * t)) ** 0.7;
      const wob = settings.motion ? 1 + 0.06 * Math.sin(now / 420 + pr.seed) : 1;
      const a0 = pr.a0 + rot * 0.35, a1 = a0 + pr.span, hR = R * (1 + pr.h * env * wob);
      const p0 = [Math.cos(a0) * R * 0.98, Math.sin(a0) * R * 0.98], p3 = [Math.cos(a1) * R * 0.98, Math.sin(a1) * R * 0.98];
      const c1 = [Math.cos(a0 + pr.span * 0.2) * hR * 1.12, Math.sin(a0 + pr.span * 0.2) * hR * 1.12];
      const c2 = [Math.cos(a1 - pr.span * 0.2) * hR * 1.12, Math.sin(a1 - pr.span * 0.2) * hR * 1.12];
      const flick = settings.motion ? 0.85 + 0.15 * Math.sin(now / 90 + pr.seed * 3) : 1;
      const strokes = [[R * 0.16, `rgba(255,100,30,${0.16 * env})`], [R * 0.08, `rgba(255,140,50,${0.28 * env * flick})`], [R * 0.035, `rgba(255,190,100,${0.45 * env * flick})`], [R * 0.012, `rgba(255,230,180,${0.35 * env})`]];
      for (const [w, col] of strokes) {
        ctx.lineWidth = w; ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p3[0], p3[1]); ctx.stroke();
      }
    }
    // ejections: a knot of gas thrown off along a prominence, fading as it goes
    if (settings.motion && now - lastEject > 6000 + srnd() * 6000) {
      const pr = prominences[Math.floor(srnd() * prominences.length)];
      ejecta.push({ a: pr.a0 + rot * 0.35 + pr.span / 2, born: now, life: 5000 + srnd() * 3000, speed: 0.8 + srnd() * 0.8 });
      lastEject = now;
    }
    for (let i = ejecta.length - 1; i >= 0; i--) {
      const e = ejecta[i], t = Math.max(0, (now - e.born) / e.life);
      if (t >= 1) { ejecta.splice(i, 1); continue; }
      const r = R * (1.05 + e.speed * t * 1.6), ex = Math.cos(e.a) * r, ey = Math.sin(e.a) * r, er = R * 0.07 * (1 + t * 1.5);
      const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, er);
      g.addColorStop(0, `rgba(255,210,140,${0.7 * (1 - t)})`); g.addColorStop(0.5, `rgba(255,150,70,${0.35 * (1 - t)})`); g.addColorStop(1, 'rgba(255,120,50,0)');
      ctx.fillStyle = g; ctx.fillRect(ex - er, ey - er, er * 2, er * 2);
    }
    ctx.restore();
  };

  // ---- the Moon ----------------------------------------------------------
  const drawMoon = (cx, cy, R, now) => {
    const pulse = settings.motion ? 1 + 0.015 * Math.sin(now / 2200) : 1;
    const halo = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 3.6 * pulse);
    halo.addColorStop(0, 'rgba(210,222,245,0.32)'); halo.addColorStop(0.4, 'rgba(190,205,235,0.10)'); halo.addColorStop(1, 'rgba(190,205,235,0)');
    ctx.fillStyle = halo; ctx.fillRect(cx - R * 4, cy - R * 4, R * 8, R * 8);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
    if (moonImage) ctx.drawImage(moonImage, cx - R * 1.03, cy - R * 1.03, R * 2.06, R * 2.06);
    else { ctx.fillStyle = '#d8dde8'; ctx.fillRect(cx - R, cy - R, R * 2, R * 2); }
    ctx.restore();
    // tonight's phase: the shadow is drawn over the lit disc; the dark part keeps faint earthshine
    const { lit, waxing } = moonPhase(new Date());
    const a = R * Math.cos(Math.PI * lit);
    ctx.save(); ctx.translate(cx, cy); if (!waxing) ctx.scale(-1, 1);
    ctx.fillStyle = 'rgba(5,10,24,0.82)'; ctx.beginPath(); ctx.arc(0, 0, R, Math.PI / 2, (3 * Math.PI) / 2);
    if (a >= 0) ctx.ellipse(0, 0, Math.max(0.01, a), R, 0, (3 * Math.PI) / 2, Math.PI / 2);
    else ctx.ellipse(0, 0, Math.max(0.01, -a), R, 0, (3 * Math.PI) / 2, Math.PI / 2, true);
    ctx.closePath(); ctx.fill(); ctx.restore();
  };

  // ---- figures -----------------------------------------------------------
  const drawFigures = (now, elapsed) => {
    const pal = PALETTES[theme];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.textAlign = 'center';
    tiles.forEach((t, i) => {
      const fig = t.fig;
      const { progress, firstPass, drawing } = settings.motion ? figureProgress(i, tiles.length, elapsed, now, FIGURE_TIMING) : { progress: 1, firstPass: false, drawing: false };
      const X = (p) => t.cx + p[0] * t.scale, Y = (p) => t.cy + p[1] * t.scale;
      // the drawing behind, clipped to its tile; it appears after the first pass and stays while the figure redraws
      if (settings.drawings && t.artT && !firstPass) {
        const art = tintedArt(fig, pal.art);
        if (art) {
          ctx.save(); ctx.beginPath(); ctx.rect(t.x, t.y, t.w, t.h); ctx.clip();
          const m = t.artT; ctx.transform(m.a, m.b, -m.b, m.a, m.tx, m.ty);
          ctx.globalAlpha = pal.artAlpha * (progress >= 1 ? 1 : 0.7);
          ctx.drawImage(art, 0, 0, fig.art.width, fig.art.height);
          ctx.restore(); ctx.globalAlpha = 1;
        }
      }
      // lines, drawn along their length
      const lens = fig.lines.map((seg) => { let l = 0; for (let k = 1; k < seg.length; k++) l += Math.hypot(seg[k][0] - seg[k - 1][0], seg[k][1] - seg[k - 1][1]); return l; });
      let budget = progress * lens.reduce((acc, l) => acc + l, 0);
      ctx.strokeStyle = drawing ? pal.line : pal.lineSoft;
      ctx.lineWidth = ZODIAC_IDS.includes(fig.id) ? Math.max(1.4, t.scale * 0.09) : Math.max(1.2, t.scale * 0.07);
      ctx.globalAlpha = 1;
      for (const seg of fig.lines) {
        if (budget <= 0) break;
        ctx.beginPath(); ctx.moveTo(X(seg[0]), Y(seg[0]));
        for (let k = 1; k < seg.length; k++) {
          const l = Math.hypot(seg[k][0] - seg[k - 1][0], seg[k][1] - seg[k - 1][1]);
          if (budget >= l) { ctx.lineTo(X(seg[k]), Y(seg[k])); budget -= l; }
          else { const q = budget / l; ctx.lineTo(X(seg[k - 1]) + (X(seg[k]) - X(seg[k - 1])) * q, Y(seg[k - 1]) + (Y(seg[k]) - Y(seg[k - 1])) * q); budget = 0; break; }
        }
        ctx.stroke();
      }
      // star dots sized by true brightness, with a soft twinkle
      fig.verts.forEach((v, vi) => {
        const tw = settings.motion ? 0.85 + 0.15 * Math.sin(now / 700 + vi * 1.7 + i) : 1;
        const r = Math.max(1.6, (1.4 + (5.2 - Math.min(5.2, v.mag)) * 0.75) * Math.min(1.4, t.scale / 40)) * tw;
        const vx = t.cx + v.x * t.scale, vy = t.cy + v.y * t.scale;
        if (v.mag < 2.2) {
          const g = ctx.createRadialGradient(vx, vy, 0, vx, vy, r * 4);
          g.addColorStop(0, `${pal.glow}${pal.glowCore})`); g.addColorStop(1, `${pal.glow}0)`);
          ctx.fillStyle = g; ctx.fillRect(vx - r * 4, vy - r * 4, r * 8, r * 8);
        }
        ctx.fillStyle = `rgba(${pal.dot},1)`; ctx.beginPath(); ctx.arc(vx, vy, r, 0, TAU); ctx.fill();
      });
      // name
      ctx.font = `600 ${t.nameSize}px system-ui, -apple-system, sans-serif`; ctx.fillStyle = pal.name; ctx.globalAlpha = firstPass ? 0.5 : 1;
      ctx.fillText(fig.name.toUpperCase(), t.nameX, t.nameY); ctx.globalAlpha = 1;
    });
  };

  // ---- public surface ----------------------------------------------------
  const relayout = () => { tiles = planTiles({ W, H, figures, showArt: settings.drawings }); };

  return {
    /** Size both canvases for the viewport and device pixel ratio. */
    resize(width, height, ratio) {
      W = width; H = height; dpr = ratio;
      for (const c of [skyCanvas, liveCanvas]) { c.width = Math.floor(W * dpr); c.height = Math.floor(H * dpr); }
      seedStars(); relayout(); clouds = planClouds({ W }); paintSky();
    },
    setTheme(next) { if (next !== theme) { theme = next; paintSky(); } },
    setSettings(next) {
      const relayoutNeeded = next.drawings !== settings.drawings;
      settings = { drawings: next.drawings, clouds: next.clouds, motion: next.motion };
      if (relayoutNeeded) relayout();
    },
    /** Paint one frame of the live layer. `now` is the animation clock in ms. */
    frame(rawNow) {
      if (!ctx || !W || !H) return;
      // A frame timestamp can sit a few ms before a performance.now() read earlier in the same frame; never let time run backwards.
      const now = Number.isFinite(rawNow) ? Math.max(lastNow, rawNow) : lastNow;
      lastNow = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const { cx, cy, R } = lampPosition(W);
      if (theme === 'light') drawSun(cx, cy, R, now); else drawMoon(cx, cy, R, now);
      if (settings.clouds) drawClouds(now);
      drawFigures(now, Date.now() - start);
    },
    /** Facts shown in the Sky menu. */
    status() { return { liveSunAt: liveSunStamp || null, tiles: tiles.length, drawingsLoaded: images.size }; },
    destroy() { if (liveSunTimer) clearInterval(liveSunTimer); tinted.clear(); images.clear(); },
  };
}
