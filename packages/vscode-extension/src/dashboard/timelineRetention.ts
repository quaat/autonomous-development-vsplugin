/**
 * Retain the last known-good event timeline across refreshes. The event log is
 * reloaded on every store change; a malformed or partially written `events.jsonl`
 * parses tolerantly but can momentarily yield a shorter/empty timeline. The
 * accepted plan requires the dashboard to "keep last valid view" on a malformed
 * write, so when a refresh both regresses the timeline and reports an event-log
 * parse problem we substitute the previous, longer timeline and annotate it.
 *
 * Pure and stateless: the caller owns the previous view (per run). run-state
 * retention is handled separately in the RunStore.
 */

import type { DashboardView } from './viewTypes';

/** Protocol diagnostic codes that indicate a damaged/partial events.jsonl. */
const EVENT_LOG_PARSE_CODES: ReadonlySet<string> = new Set([
  'parse-error',
  'truncated-tail',
  'non-object',
  'invalid-envelope'
]);

/** Marker code for a timeline served from the retained last-good projection. */
export const EVENT_LOG_RETAINED_CODE = 'event-log-retained';

export function reconcileTimeline(
  prev: DashboardView | undefined,
  next: DashboardView
): DashboardView {
  const hasParseIssue = next.diagnostics.some((d) => EVENT_LOG_PARSE_CODES.has(d.code));
  if (!prev || !hasParseIssue || next.timeline.length >= prev.timeline.length) {
    return next;
  }
  return {
    ...next,
    timeline: prev.timeline,
    truncatedTimeline: prev.truncatedTimeline,
    diagnostics: [
      ...next.diagnostics,
      {
        code: EVENT_LOG_RETAINED_CODE,
        message:
          'events.jsonl is malformed or partially written; showing the last known-good event timeline.',
        severity: 'info'
      }
    ]
  };
}
