// src/components/admin/Voyage/WaterCard.js
//
// A data card whose background fills with translucent water in the theme
// accent (the approved V4b mockup's `.wc`). The level is one transform on the
// water block (translateY) and the waves are one transform on a strip twice
// the card's width (translateX), so both run on the compositor and never
// trigger layout. The text sits above the water at full contrast and never
// depends on the water to be read; the water is aria-hidden.
//
// The card starts empty and rises to its level the first time it scrolls
// into view. Its waves pause while it is off screen (and, through a class on
// the chapter, while the tab is hidden); under reduced motion the level is
// shown at once and the waves stand still (CSS).

import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { shownLevel } from './insightsModel';

/** A sine path across a 200 x 10 strip: two periods per half, so sliding it left by half loops seamlessly. */
export function wavePath(amp, phase) {
  let d = `M0 ${(5 + Math.sin(phase) * amp).toFixed(2)}`;
  for (let x = 2; x <= 200; x += 2) d += ` L${x} ${(5 + Math.sin(phase + (x / 50) * Math.PI * 2) * amp).toFixed(2)}`;
  return d;
}
const BACK = `${wavePath(3, 1.4)} L200 10 L0 10 Z`;
const FRONT = `${wavePath(2.6, 0)} L200 10 L0 10 Z`;
const CREST = wavePath(2.6, 0);

/**
 * Fills on first view and reports whether the card is on screen.
 * Without IntersectionObserver (old browsers, tests) the card fills at once.
 */
export function useFillOnView(ref) {
  const [state, setState] = useState({ filled: false, visible: true });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setState({ filled: true, visible: true }); return undefined; }
    const io = new IntersectionObserver(([entry]) => {
      setState((s) => ({ filled: s.filled || entry.isIntersecting, visible: entry.isIntersecting }));
    }, { rootMargin: '40px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return state;
}

/** The small tag under a number: "Biggest fall" warns; "Beat last quarter", "On pace" and "Best rate" are good news. */
export function CardTag({ tone = 'good', children }) {
  return (
    <span className={`wc__tag${tone === 'good' ? ' wc__tag--good' : ''}`}>
      {tone === 'good' ? <ArrowUpRight size={12} aria-hidden="true" /> : <ArrowDownRight size={12} aria-hidden="true" />}
      {children}
    </span>
  );
}

/**
 * @param {object} props
 * @param {number} props.level 0..1 of the card's height (drawn at least MIN_LEVEL when nonzero).
 * @param {number|null} [props.mark] quarter mode: where last quarter's count sits (dashed line).
 * @param {React.ReactNode} props.name
 * @param {boolean} [props.title] the name is a title (projects), not a small-caps label.
 * @param {React.ReactNode} props.num
 * @param {string} [props.unit]
 * @param {React.ReactNode[]} [props.lines] first line in the main colour, the rest muted.
 * @param {React.ReactNode} [props.chips]
 * @param {React.ReactNode} [props.tag]
 * @param {boolean} [props.short]
 * @param {number} [props.index] stagger position within its row.
 * @param {string} props.label the whole card in one sentence, for screen readers.
 */
export default function WaterCard({ level, mark = null, name, title = false, num, unit = '', lines = [], chips = null, tag = null, short = false, index = 0, label }) {
  const ref = useRef(null);
  const { filled, visible } = useFillOnView(ref);
  const style = { '--level': shownLevel(level).toFixed(3), '--delay': `${((index % 16) * 0.07).toFixed(2)}s` };
  const cls = ['wc', short && 'wc--short', filled && 'is-filled', !visible && 'is-paused'].filter(Boolean).join(' ');
  return (
    <article ref={ref} className={cls} style={style} aria-label={label} data-testid="water-card">
      <div className="wc__water" aria-hidden="true">
        <svg className="wc__wave wc__wave--back" viewBox="0 0 200 10" preserveAspectRatio="none" focusable="false"><path d={BACK} /></svg>
        <svg className="wc__wave wc__wave--front" viewBox="0 0 200 10" preserveAspectRatio="none" focusable="false"><path d={FRONT} /></svg>
        <svg className="wc__crest" viewBox="0 0 200 10" preserveAspectRatio="none" focusable="false"><path d={CREST} /></svg>
        <div className="wc__body" />
      </div>
      {mark !== null && <div className="wc__mark" style={{ '--mark': mark }} aria-hidden="true" />}
      <div className={`wc__name${title ? ' wc__name--title' : ''}`} aria-hidden="true">{name}</div>
      <div className="wc__num" aria-hidden="true">{num}{unit && <small>{unit}</small>}</div>
      {lines.map((line, i) => <div key={i} className={i === 0 ? 'wc__line' : 'wc__sub'} aria-hidden="true">{line}</div>)}
      {chips && <div className="wc__chips" aria-hidden="true">{chips}</div>}
      {tag}
    </article>
  );
}
