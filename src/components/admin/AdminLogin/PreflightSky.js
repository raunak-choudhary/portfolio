// src/components/admin/AdminLogin/PreflightSky.js
//
// The night behind the login: a 2D canvas of stars that drift slowly and
// twinkle faintly, and the Earth's night limb as one thin lit arc along the
// bottom edge (drawn on the same canvas, no texture download). Under reduced motion the
// sky is one still frame. The loop runs at about 30 frames a second, which
// is plenty for motion this slow, and stops while the tab is hidden.

import React, { useEffect, useRef } from 'react';
import { drawFrame, makeStars } from './preflightModel';

const FRAME_MS = 1000 / 30;

/** Whether the visitor asked the operating system for less motion. */
export const prefersReducedMotion = () => {
  try {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
};

const PreflightSky = ({ palette = 'night' }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    let ctx = null;
    try { ctx = canvas?.getContext('2d') || null; } catch { ctx = null; }
    if (!ctx) return undefined; // no canvas support: the plain page colour remains

    let stars = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastPaint = 0;
    let start = 0;
    const still = prefersReducedMotion();

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      // the sky fills its own box, which is the window less any scrollbar
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      stars = makeStars(width, height);
      drawFrame(ctx, stars, { width, height, seconds: still || !start ? 0 : (lastPaint - start) / 1000, palette });
    };

    const tick = (now) => {
      frame = window.requestAnimationFrame(tick);
      if (!start) start = now;
      if (now - lastPaint < FRAME_MS) return;
      lastPaint = now;
      drawFrame(ctx, stars, { width, height, seconds: (now - start) / 1000, palette });
    };

    const stop = () => { if (frame) window.cancelAnimationFrame(frame); frame = 0; };
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (!still && !frame) frame = window.requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener('resize', resize);
    if (!still) {
      frame = window.requestAnimationFrame(tick);
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      stop();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [palette]);

  return (
    <div className="preflight-sky" aria-hidden="true">
      <canvas ref={canvasRef} className="preflight-sky__stars" data-motion={prefersReducedMotion() ? 'still' : 'drift'} />
    </div>
  );
};

export default PreflightSky;
