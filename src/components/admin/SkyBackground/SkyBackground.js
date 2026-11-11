// src/components/admin/SkyBackground/SkyBackground.js
//
// The zodiac sky behind the admin dashboard. Two full-size canvases inside
// the dashboard container; the renderer does the drawing, this component
// owns the lifecycle: loading figures.json, sizing, the frame loop, pausing
// when the tab is hidden, and a still frame when motion is off or the
// operating system asks for less motion.

import React, { useEffect, useRef, useState } from 'react';
import { createSkyRenderer } from './skyRenderer';
import { useSkySettings } from './SkySettingsContext';
import './SkyBackground.css';

/** Where the sky assets live; CRA serves public/ at PUBLIC_URL. */
export const SKY_ASSET_BASE = `${process.env.PUBLIC_URL || ''}/admin/sky/`;

/** With motion off, the Sun, Moon and clock still move, so repaint now and then. */
const STILL_REPAINT_MS = 60 * 1000;

/**
 * @param {object} props
 * @param {string} [props.assetBase] override for tests.
 * @param {boolean} [props.liveSun] load NASA's live Sun image (default true; off in tests).
 * @param {boolean} [props.motion] false forces a still frame regardless of the settings.
 */
export default function SkyBackground({ assetBase = SKY_ASSET_BASE, liveSun = true, motion }) {
  const { settings, resolvedTheme, effectiveMotion: settingsMotion } = useSkySettings();
  // A host may force a still frame (the sign-out page does); otherwise the settings decide.
  const effectiveMotion = typeof motion === 'boolean' ? motion && settingsMotion : settingsMotion;
  const skyRef = useRef(null), liveRef = useRef(null), rendererRef = useRef(null);
  const [figures, setFigures] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // Figures are precomputed at build time (scripts/build-sky-figures.mjs); one small same-origin fetch.
  useEffect(() => {
    let cancelled = false;
    fetch(`${assetBase}figures.json`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`figures.json ${response.status}`))))
      .then((data) => { if (!cancelled) setFigures(Array.isArray(data?.figures) ? data.figures : []); })
      .catch(() => { if (!cancelled) setLoadFailed(true); });
    return () => { cancelled = true; };
  }, [assetBase]);

  // Create the renderer once the figures and canvases exist; size it to the window.
  useEffect(() => {
    if (!figures || !skyRef.current || !liveRef.current) return undefined;
    const renderer = createSkyRenderer({ skyCanvas: skyRef.current, liveCanvas: liveRef.current, figures, assetBase, liveSun });
    rendererRef.current = renderer;
    const resize = () => renderer.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2));
    resize();
    renderer.setTheme(resolvedTheme);
    renderer.setSettings({ drawings: settings.drawings, clouds: settings.clouds, motion: effectiveMotion });
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); renderer.destroy(); rendererRef.current = null; };
    // Theme and settings have their own effects below; the renderer is rebuilt only when the data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [figures, assetBase, liveSun]);

  useEffect(() => { rendererRef.current?.setTheme(resolvedTheme); }, [resolvedTheme, figures]);
  useEffect(() => {
    rendererRef.current?.setSettings({ drawings: settings.drawings, clouds: settings.clouds, motion: effectiveMotion });
  }, [settings.drawings, settings.clouds, effectiveMotion, figures]);

  // Frame loop: animation frames while motion is on and the tab is visible; otherwise a still frame now and then.
  useEffect(() => {
    if (!figures) return undefined;
    let frameId = 0, timer = 0, stopped = false;
    const paint = (now) => { rendererRef.current?.frame(now); };
    const loop = (now) => { if (stopped) return; paint(now); frameId = window.requestAnimationFrame(loop); };
    const startLoop = () => {
      stopLoop();
      paint(performance.now());   // first frame at once, so the sky never shows blank
      if (effectiveMotion) frameId = window.requestAnimationFrame(loop);
      else timer = window.setInterval(() => paint(performance.now()), STILL_REPAINT_MS);
    };
    const stopLoop = () => { if (frameId) window.cancelAnimationFrame(frameId); if (timer) window.clearInterval(timer); frameId = 0; timer = 0; };
    const onVisibility = () => { if (document.hidden) stopLoop(); else startLoop(); };
    startLoop();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stopped = true; stopLoop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [figures, effectiveMotion, resolvedTheme, settings.drawings, settings.clouds]);

  return (
    <div className={`sky-background${loadFailed ? ' sky-background--plain' : ''}`} aria-hidden="true" data-testid="sky-background">
      <canvas ref={skyRef} className="sky-background__layer" />
      <canvas ref={liveRef} className="sky-background__layer" />
    </div>
  );
}
