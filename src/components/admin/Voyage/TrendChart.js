// src/components/admin/Voyage/TrendChart.js
//
// Visits per day (per week for twelve months) for the Analytics chapter,
// drawn with Recharts: the current range as a filled line, the comparison as
// a dashed line. Loaded lazily by AnalyticsChapter so Recharts lands in its
// own chunk and only when the chapter shows the chart.
//
// Accessibility: Recharts' accessibility layer makes the chart one tab stop
// whose arrow keys move the tooltip point by point; a visually hidden
// sentence states the totals and the peak for screen readers. Colours come
// from CSS classes (theme tokens), not from presentation attributes, because
// var() is unreliable inside SVG attributes.

import React from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const n = (v) => Math.round(v).toLocaleString('en-US');

/** The tooltip card: the point's label, then current and comparison values. */
function Tip({ active, payload, curName, prevName }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="orion-tip">
      <b>{p.label}</b>
      {p.cur !== null && <span>{curName}<i>{n(p.cur)}</i></span>}
      {p.prev !== null && <span>{prevName}{p.prevLabel ? ` (${p.prevLabel})` : ''}<i>{n(p.prev)}</i></span>}
    </div>
  );
}

/**
 * @param {object} props
 * @param {Array<{label: string, prevLabel?: string, cur: number|null, prev: number|null}>} props.points
 * @param {string[]} props.ticks labels to show on the x axis.
 * @param {string} props.curName legend name of the current range.
 * @param {string} props.prevName legend name of the comparison.
 * @param {string} props.summary one sentence describing the chart.
 * @param {boolean} [props.animate]
 */
export default function TrendChart({ points, ticks, curName, prevName, summary, animate = true }) {
  const narrow = typeof window !== 'undefined' && window.innerWidth < 600;
  return (
    <div className="orion-chart orion-trend" role="group" aria-label={summary}>
      <p className="sr-only">{summary} Focus the chart and use the arrow keys to read each point.</p>
      <ResponsiveContainer width="100%" height={narrow ? 170 : 210}>
        <ComposedChart data={points} margin={{ top: 10, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
          <defs>
            <linearGradient id="orion-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" className="orion-area__top" />
              <stop offset="1" className="orion-area__bottom" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} className="orion-grid" />
          <XAxis dataKey="label" ticks={ticks} interval={0} tickLine={false} axisLine={false} className="orion-axis" tickMargin={6} minTickGap={8} />
          <YAxis allowDecimals={false} width={34} tickLine={false} axisLine={false} className="orion-axis" tickCount={3} />
          <Tooltip content={<Tip curName={curName} prevName={prevName} />} cursor={{ className: 'orion-cursor' }} isAnimationActive={false} />
          <Line type="monotone" dataKey="prev" name={prevName} className="orion-trend__prev" dot={false} activeDot={false} connectNulls={false} isAnimationActive={animate} />
          <Area type="monotone" dataKey="cur" name={curName} className="orion-trend__cur" fill="url(#orion-area)" dot={false} activeDot={{ r: 4, className: 'orion-trend__dot' }} connectNulls={false} isAnimationActive={animate} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
