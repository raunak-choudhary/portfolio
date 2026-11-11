// src/components/admin/AdminSignOut/exitCanvas.js
//
// The two canvas scenes of the sign-out sequence: the Academy-style
// countdown leader, and the field of orbit arcs behind the credits. Pure
// drawing functions that take a 2D context; nothing here touches the DOM.

import { leaderNumber } from './exitModel';

const TAU = Math.PI * 2;

/**
 * One frame of the countdown leader: sweep wipe, two circles, crosshair,
 * the number, then grain, a stray scratch and a vignette.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{W: number, H: number, dpr: number, font: string}} view
 * @param {number} tLeader ms since the leader began.
 * @param {() => number} rnd random source (injectable for tests).
 * @returns {number} the number shown.
 */
export function drawLeader(ctx, { W, H, dpr, font }, tLeader, rnd = Math.random) {
  const num = leaderNumber(tLeader), frac = (Math.max(0, tLeader) % 1000) / 1000;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b0b0c'; ctx.fillRect(0, 0, W, H);
  const jx = (rnd() - 0.5) * 1.5, jy = (rnd() - 0.5) * 1.5;   // gate weave
  ctx.save(); ctx.translate(W / 2 + jx, H / 2 + jy);
  const R = Math.min(W, H) * 0.36;
  ctx.fillStyle = '#2a2a2c'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R * 2.2, -Math.PI / 2, -Math.PI / 2 + frac * TAU); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 2;
  for (const r of [R, R * 0.82]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); }
  ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-W, 0); ctx.lineTo(W, 0); ctx.moveTo(0, -H); ctx.lineTo(0, H); ctx.stroke();
  ctx.fillStyle = '#f2f2f2'; ctx.font = `700 ${Math.round(R * 1.25)}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 0, R * 0.06);
  ctx.restore();
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 260; i++) { ctx.fillStyle = rnd() < 0.5 ? '#000' : '#fff'; ctx.fillRect(rnd() * W, rnd() * H, 1.5, 1.5); }
  ctx.globalAlpha = 1;
  if (rnd() < 0.25) { ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; const x = rnd() * W; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (rnd() - 0.5) * 20, H); ctx.stroke(); }
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  return num;
}

/** Nine tilted orbit arcs, each with a small body travelling along it. */
export const makeArcs = () => Array.from({ length: 9 }, (_, i) => ({ r: 0.25 + i * 0.09, tilt: 0.25 + (i % 3) * 0.12, speed: 0.00003 * (1 + (i % 4)), phase: i * 0.7 }));

/**
 * The credits backdrop: near-black, drifting orbit arcs, a dusting of grain.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{W: number, H: number, dpr: number}} view
 * @param {number} now animation clock in ms.
 * @param {Array} arcs from makeArcs.
 * @param {() => number} rnd random source.
 */
export function drawCreditBackground(ctx, { W, H, dpr }, now, arcs, rnd = Math.random) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, W, H);
  const span = Math.max(W, H);
  ctx.save(); ctx.translate(W * 0.5, H * 0.55);
  for (const a of arcs) {
    ctx.save(); ctx.rotate(a.phase + now * a.speed); ctx.scale(1, a.tilt);
    ctx.strokeStyle = 'rgba(211,163,90,0.10)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, a.r * span, 0, TAU); ctx.stroke();
    const ang = now * a.speed * 9 + a.phase;
    ctx.fillStyle = 'rgba(255,230,180,0.5)'; ctx.beginPath(); ctx.arc(Math.cos(ang) * a.r * span, Math.sin(ang) * a.r * span, 1.6, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.globalAlpha = 0.07; ctx.fillStyle = '#fff';
  for (let i = 0; i < 120; i++) ctx.fillRect(rnd() * W, rnd() * H, 1, 1);
  ctx.globalAlpha = 1;
}
