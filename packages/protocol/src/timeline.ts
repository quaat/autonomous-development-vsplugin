/**
 * Reconstruct a human-readable, ordered timeline from RunEvents.
 *
 * This is the protocol-level event timeline (a chronological projection of the
 * append-only log). The core package separately derives the 12-stage *workflow*
 * timeline from run-state; the two are complementary.
 */

import type { RunEvent, RunEventSource, RunEventType } from './events';

export interface EventTimelineEntry {
  readonly sequence: number;
  readonly timestamp: string;
  readonly phase: string;
  readonly type: RunEventType;
  readonly source: RunEventSource;
  readonly summary: string;
}

function summarize(event: RunEvent): string {
  const p = event.payload;
  const field = (name: string): string | undefined => {
    if (typeof p === 'object' && p !== null && !Array.isArray(p)) {
      const value = (p as Record<string, unknown>)[name];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
    }
    return undefined;
  };

  switch (event.type) {
    case 'run.created':
      return `Run created${field('label') ? ` (${field('label')})` : ''}`;
    case 'run.status.changed':
      return `Status changed to ${field('status') ?? 'unknown'}`;
    case 'phase.started':
      return `Phase started: ${field('phase') ?? event.phase}`;
    case 'phase.completed':
      return `Phase completed: ${field('phase') ?? event.phase}`;
    case 'phase.failed':
      return `Phase failed: ${field('phase') ?? event.phase}`;
    case 'verification.started':
      return `Verification started: ${field('name') ?? ''}`.trimEnd();
    case 'verification.completed': {
      const name = field('name') ?? '';
      const exit = field('exitCode');
      return `Verification ${name} ${exit === '0' ? 'passed' : `exited ${exit ?? '?'}`}`.trim();
    }
    case 'review.started':
      return `Review round ${field('round') ?? ''} started`.trimEnd();
    case 'review.completed':
      return `Review ${field('verdict') ?? 'completed'}`;
    case 'review.finding.created':
      return `Finding ${field('id') ?? ''} (${field('severity') ?? '?'})`.trim();
    case 'review.finding.triaged':
      return `Finding ${field('id') ?? ''} triaged: ${field('disposition') ?? '?'}`.trim();
    case 'gate.changed':
      return `Gate changed: ${field('name') ?? ''}`.trimEnd();
    case 'drift.detected':
      return `Drift detected: ${field('classification') ?? ''}`.trimEnd();
    case 'artifact.created':
      return `Artifact created: ${field('kind') ?? field('path') ?? ''}`.trimEnd();
    case 'artifact.accepted':
      return `Artifact accepted: ${field('kind') ?? field('path') ?? ''}`.trimEnd();
    default:
      return event.type;
  }
}

/** Return events ordered by sequence (stable), each with a derived summary. */
export function reconstructTimeline(events: readonly RunEvent[]): EventTimelineEntry[] {
  const ordered = [...events].sort((a, b) => {
    if (a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }
    return 0;
  });

  return ordered.map((event) => ({
    sequence: event.sequence,
    timestamp: event.timestamp,
    phase: event.phase,
    type: event.type,
    source: event.source,
    summary: summarize(event)
  }));
}
