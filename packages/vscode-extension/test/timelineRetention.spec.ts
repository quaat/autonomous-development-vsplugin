import assert from 'node:assert/strict';

import { reconcileTimeline, EVENT_LOG_RETAINED_CODE } from '../src/dashboard/timelineRetention';
import type {
  DashboardDiagnostic,
  DashboardTimelineEntry,
  DashboardView
} from '../src/dashboard/viewTypes';

function entry(sequence: number): DashboardTimelineEntry {
  return {
    sequence,
    timestamp: '',
    phase: 'review',
    type: 'review.started',
    source: 'controller',
    summary: ''
  };
}

function view(
  timeline: DashboardTimelineEntry[],
  diagnostics: DashboardDiagnostic[]
): DashboardView {
  return { timeline, truncatedTimeline: false, diagnostics } as unknown as DashboardView;
}

const PARSE_DIAG: DashboardDiagnostic = {
  code: 'parse-error',
  message: 'events.jsonl (line 2): line is not valid JSON; skipped',
  severity: 'warning'
};

describe('reconcileTimeline (F-202 keep-last-valid)', () => {
  it('returns the fresh view unchanged when there is no prior view', () => {
    const next = view([entry(1), entry(2)], []);
    assert.equal(reconcileTimeline(undefined, next), next);
  });

  it('returns the fresh view unchanged on a clean (non-regressing) refresh', () => {
    const prev = view([entry(1), entry(2)], []);
    const next = view([entry(1), entry(2), entry(3)], []);
    assert.equal(reconcileTimeline(prev, next), next);
  });

  it('retains the last-good timeline when a malformed refresh regresses it', () => {
    const prev = view([entry(1), entry(2), entry(3)], []);
    const next = view([entry(1)], [PARSE_DIAG]);
    const out = reconcileTimeline(prev, next);
    assert.deepEqual(
      out.timeline.map((e) => e.sequence),
      [1, 2, 3]
    );
    assert.ok(out.diagnostics.some((d) => d.code === EVENT_LOG_RETAINED_CODE));
    // The original parse diagnostic is preserved alongside the retention notice.
    assert.ok(out.diagnostics.some((d) => d.code === 'parse-error'));
  });

  it('does not retain when the timeline regresses without a parse problem', () => {
    const prev = view([entry(1), entry(2), entry(3)], []);
    const next = view([entry(1)], []);
    const out = reconcileTimeline(prev, next);
    assert.equal(out, next);
    assert.equal(out.timeline.length, 1);
  });
});
