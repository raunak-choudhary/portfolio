// src/components/admin/AdminSignOut/ExitVoyageSky.js
//
// The backdrop of the sign-out film: the voyage's own 3D field, held where the
// camera was when the admin signed out (or at the prologue's Earth when
// nothing was recorded). No scroll and no input reach it; with motion on, the
// Earth turns and the photographs drift as they did on the voyage, and with
// motion off (the Sky setting or the operating system) it is a still frame.
// Without WebGL, or when the GPU refuses a context, it is the voyage's flat
// fallback sky instead.
//
// The field (and Three.js with it) is imported on demand, so the film's first
// frames never wait for it and the sign-out chunk stays small. The parent can
// release the WebGL context early through `releaseRef` (the film does so as
// it moves to the login); unmounting releases it too, once.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import SkyBackground, { SKY_ASSET_BASE } from '../SkyBackground/SkyBackground';
import { useSkySettings } from '../SkyBackground/SkySettingsContext';
import { webglAvailable } from '../Voyage/webgl';
import { qualityFor } from '../Voyage/voyageModel';
import { chooseExitBackdrop } from './exitBackdrop';

/** How often a still field is repainted, so textures that arrive late still show. */
export const STILL_REPAINT_MS = 500;

const fetchJson = (url, fallback) => fetch(url).then((r) => (r.ok ? r.json() : fallback)).catch(() => fallback);

/**
 * @param {object} props
 * @param {{f: number, chapter: string, theme: ('dark'|'light'|null)}|null} props.position the recorded voyage position.
 * @param {() => boolean} [props.shouldPaint] false while the film covers the sky, to save the GPU.
 * @param {{current: (null|(() => void))}} [props.releaseRef] receives a function that disposes the field now.
 */
export default function ExitVoyageSky({ position, shouldPaint, releaseRef }) {
  const { settings, resolvedTheme, effectiveMotion } = useSkySettings();
  const [webgl] = useState(() => webglAvailable());
  const [failed, setFailed] = useState(false);
  const [assets, setAssets] = useState(null);
  const canvasRef = useRef(null), fieldRef = useRef(null), paintRef = useRef(shouldPaint);
  paintRef.current = shouldPaint;

  const choice = useMemo(
    () => chooseExitBackdrop({ webgl: webgl && !failed, position, fallbackTheme: resolvedTheme }),
    [webgl, failed, position, resolvedTheme],
  );
  const isField = choice.kind === 'field';
  const themeRef = useRef(choice.theme);
  themeRef.current = choice.theme;

  // the constellation figures and the photograph manifest, as the voyage loads them
  useEffect(() => {
    if (!isField) return undefined;
    let cancelled = false;
    Promise.all([fetchJson(`${SKY_ASSET_BASE}figures.json`, { figures: [] }), fetchJson(`${SKY_ASSET_BASE}deep/manifest.json`, [])])
      .then(([f, d]) => { if (!cancelled) setAssets({ figures: Array.isArray(f?.figures) ? f.figures : [], deep: Array.isArray(d) ? d : [] }); });
    return () => { cancelled = true; };
  }, [isField]);

  // the field itself: created once the module and the data are in, frozen at the recorded position
  useEffect(() => {
    if (!isField || !assets) return undefined;
    let cancelled = false, released = false, field = null, frame = 0, timer = 0;
    const resize = () => field?.resize(window.innerWidth, window.innerHeight);
    const release = () => {
      if (released) return;
      released = true;
      cancelAnimationFrame(frame); clearInterval(timer);
      window.removeEventListener('resize', resize);
      field?.dispose();
      field = null; fieldRef.current = null;
    };
    if (releaseRef) releaseRef.current = release;
    const wanted = () => !document.hidden && (paintRef.current ? paintRef.current() : true);
    const paint = (now, snap = false) => { if (field) field.frame(choice.scrollFraction, now, { snap }); };

    import('../Voyage/skyField').then(({ createSkyField }) => {
      if (cancelled || released || !canvasRef.current) return;
      const quality = qualityFor({ width: window.innerWidth, devicePixelRatio: window.devicePixelRatio || 1, reducedMotion: !effectiveMotion, webgl: true });
      try {
        field = createSkyField({ canvas: canvasRef.current, figures: assets.figures, deepManifest: assets.deep, assetBase: SKY_ASSET_BASE, quality, theme: themeRef.current, smallTextures: window.innerWidth < 768, drawings: settings.drawings });
      } catch {
        released = true;
        setFailed(true);   // the GPU refused a context: the flat sky takes over
        return;
      }
      fieldRef.current = field;
      resize();
      window.addEventListener('resize', resize);
      paint(performance.now(), true);   // land on the pose at once; no fly-in from the prologue
      if (quality.fly) {
        const tick = (now) => { if (released) return; if (wanted()) paint(now); frame = requestAnimationFrame(tick); };
        frame = requestAnimationFrame(tick);
      } else {
        timer = setInterval(() => { if (wanted()) paint(performance.now(), true); }, STILL_REPAINT_MS);
      }
    }).catch(() => { if (!cancelled) setFailed(true); });

    return () => {
      cancelled = true;
      release();
      if (releaseRef && releaseRef.current === release) releaseRef.current = null;
    };
    // The field is built once per backdrop; the theme follows below without a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isField, assets, choice.scrollFraction]);

  useEffect(() => { fieldRef.current?.setTheme(choice.theme); }, [choice.theme]);

  if (!isField) {
    return <div className="voyage-flat-sky" data-backdrop="flat"><SkyBackground motion={false} /></div>;
  }
  return <canvas ref={canvasRef} className="exit-voyage-field" data-backdrop="field" data-chapter={choice.chapter} aria-hidden="true" />;
}
