// supabase/functions/quarterly-report/summary.ts
//
// Joins the period, the three event windows and the content freshness into
// the one object stored in analytics_reports.summary. The report text is
// built only from this object, so a stored report can always be explained
// from its own numbers.

import { newYorkDayIso, quarterCode, quarterFirstDayWords, quarterLabel, type ReportPeriod } from './period.ts';
import {
  type EventRow,
  pace,
  type ProjectRef,
  type SectionEdit,
  staleSections,
  summarizeWindow,
  type WindowSummary,
} from './rules.ts';

export const SUMMARY_VERSION = 1;

export interface ComparisonInfo {
  quarter: string; // "Q2 2026"
  label: string; // "April to June 2026"
  days: number;
}

export interface ReportSummary {
  version: number;
  quarter: string;
  label: string;
  partial: boolean;
  days: number;
  quarterLength: number;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  previous: ComparisonInfo;
  lastYear: ComparisonInfo;
  /** New York day of the first `engaged` row ever stored, or null. */
  engagementStartedOn: string | null;
  /** New York day of the first `project_open` row ever stored, or null. */
  projectTrackingStartedOn: string | null;
  windows: { current: WindowSummary; previous: WindowSummary; lastYear: WindowSummary };
  /** Where a partial quarter is heading: round(count * quarterLength / dayN). Null for a full quarter. */
  pace: { visits: number; reached: number } | null;
  stale: Array<{ name: string; days: number }>;
  freshSections: number;
  projectCount: number;
  /** "1 January 2027": when the next scheduled report arrives. */
  nextReportOn: string;
}

export interface SummaryInput {
  period: ReportPeriod;
  generatedAt: Date;
  events: { current: EventRow[]; previous: EventRow[]; lastYear: EventRow[] };
  projects: ProjectRef[];
  engagementStart: Date | null;
  projectTrackingStart: Date | null;
  edits: SectionEdit[];
}

export function buildSummary(input: SummaryInput): ReportSummary {
  const { period } = input;
  const options = { projects: input.projects, engagementStart: input.engagementStart };
  const current = summarizeWindow(input.events.current, options);
  // Comparison windows keep everything but the per-project table, which the
  // report shows for the current quarter only.
  const compareOptions = { projects: [], engagementStart: input.engagementStart };
  const previous = summarizeWindow(input.events.previous, compareOptions);
  const lastYear = summarizeWindow(input.events.lastYear, compareOptions);

  // Freshness is judged when the report is made: "not edited for N days"
  // reads true on the day the email arrives.
  const { stale, fresh } = staleSections(input.edits, input.generatedAt);

  return {
    version: SUMMARY_VERSION,
    quarter: period.code,
    label: period.label,
    partial: period.partial,
    days: period.days,
    quarterLength: period.quarterLength,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    generatedAt: input.generatedAt.toISOString(),
    previous: {
      quarter: quarterCode(period.previous.quarter),
      label: quarterLabel(period.previous.quarter),
      days: period.previous.days,
    },
    lastYear: {
      quarter: quarterCode(period.lastYear.quarter),
      label: quarterLabel(period.lastYear.quarter),
      days: period.lastYear.days,
    },
    engagementStartedOn: input.engagementStart ? newYorkDayIso(input.engagementStart) : null,
    projectTrackingStartedOn: input.projectTrackingStart ? newYorkDayIso(input.projectTrackingStart) : null,
    windows: { current, previous, lastYear },
    pace: period.partial
      ? {
        visits: pace(current.visits, period.quarterLength, period.days),
        reached: pace(current.reached, period.quarterLength, period.days),
      }
      : null,
    stale,
    freshSections: fresh,
    projectCount: input.projects.length,
    nextReportOn: quarterFirstDayWords(period.nextReportOn),
  };
}

/** True when tracking of a kind began after the period started (so the report says "Recorded from"). */
export const startedInsidePeriod = (startedOn: string | null, periodStart: string) =>
  Boolean(startedOn) && (startedOn as string) > periodStart;
