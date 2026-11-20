// src/components/admin/Voyage/ScoreGuide.js
//
// "How the score works" as four blocks in an ExplainDialog, drawn from the
// owner's real data (the fix queue model) and the real rules (scoreGuide):
//   1. the sections share 100 points: one bar, each section as wide as its
//      weight and filled as far as it has earned;
//   2. every record splits into 70 for required fields and 30 for quality;
//   3. the sections with a record target, as dots filled by what exists;
//   4. the queue's own top gains, biggest first.
// Nothing here is typed by hand: every number comes from the model or the rules.

import React from 'react';
import ExplainDialog, { ExplainStep } from './ExplainDialog';
import { gainText, round1, scoreGuide } from './fixQueueModel';

const pct = (part, whole) => `${whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0}%`;

/** Block 1: the hundred points, section by section. */
function SectionsBar({ points }) {
  const sorted = [...points].sort((a, b) => b.weight - a.weight);
  return (
    <>
      <div className="sg-bar" role="img" aria-label={sorted.map((p) => `${p.name} ${round1(p.earned)} of ${p.weight}`).join(', ')}>
        {sorted.map((p) => (
          <span key={p.table} className="sg-bar__seg" style={{ flexGrow: p.weight }} title={`${p.name}: ${round1(p.earned)} of ${p.weight}`}>
            <span className="sg-bar__fill" style={{ width: pct(p.earned, p.weight) }} />
          </span>
        ))}
      </div>
      <ul className="sg-legend">
        {sorted.map((p) => (
          <li key={p.table} className={p.weight - p.earned >= 0.05 ? 'has-left' : ''}>
            <span>{p.name}</span><b>{round1(p.earned)}<small> / {p.weight}</small></b>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Block 3: one row of dots per section with a record target. */
function TargetDots({ targets, points }) {
  return (
    <ul className="sg-targets">
      {targets.map((t) => {
        const have = points.find((p) => p.table === t.table)?.active ?? 0;
        return (
          <li key={t.table}>
            <span className="sg-targets__name">{t.name}</span>
            <span className="sg-dots" aria-label={`${Math.min(have, t.minItems)} of ${t.minItems}`}>
              {Array.from({ length: t.minItems }, (_, k) => <i key={k} className={k < have ? 'is-on' : ''} />)}
            </span>
            <small>{have >= t.minItems ? 'full points' : `${have} of ${t.minItems}`}</small>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {object} props.model the fix queue model (buildFixQueue).
 */
export default function ScoreGuide({ open, onClose, model }) {
  const rules = scoreGuide();
  const points = model?.points || [];
  const top = (model?.groups || []).slice(0, 3);
  return (
    <ExplainDialog
      open={open}
      onClose={onClose}
      title="How the score works"
      lead={model ? <>Your score now: <b>{round1(model.preciseScore)}</b> of {rules.total}. Four rules make it.</> : `Out of ${rules.total}. Four rules make it.`}
      foot="The Health tile rounds each section before adding up, so it can be a point off from the score here."
    >
      <ExplainStep n={1} title={`The sections share ${rules.total} points`}>
        <p>Bigger sections are worth more. The bright part is what you have earned.</p>
        <SectionsBar points={points} />
      </ExplainStep>

      <ExplainStep n={2} title={`Every record: ${rules.required} + ${rules.quality}`}>
        <div className="sg-split" aria-hidden="true">
          <span style={{ width: pct(rules.required, 100) }}><b>{rules.required}</b> required fields</span>
          <span style={{ width: pct(rules.quality, 100) }}><b>{rules.quality}</b> quality</span>
        </div>
        <p>Required: what the record needs, like a title and a description. Quality: logos, pictures and proof links.</p>
        <p className="sg-chip-line"><span className="sg-chip">{rules.minDescription}+ characters</span> before a description counts.</p>
      </ExplainStep>

      <ExplainStep n={3} title="Enough records">
        <p>Below its target a section earns only that share: 2 of 3 projects keeps two thirds.</p>
        <TargetDots targets={rules.targets} points={points} />
      </ExplainStep>

      <ExplainStep n={4} title="Biggest gain first">
        <p>Each fix shows the points it adds, and the queue lists the biggest first.</p>
        {top.length ? (
          <ol className="sg-gains">
            {top.map((g) => <li key={g.ruleKey}><span className="sg-chip sg-chip--gain">{gainText(g.gain)}</span><span>{g.title}</span></li>)}
          </ol>
        ) : <p className="sg-chip-line"><span className="sg-chip sg-chip--gain">Nothing left</span> Every fix is done.</p>}
      </ExplainStep>
    </ExplainDialog>
  );
}
