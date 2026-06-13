/**
 * Cross-source consistency checks between the authoritative `run-state.json`
 * and the supplementary `events.jsonl` projection. run-state always wins for
 * status; these checks only surface disagreement as a **non-fatal** diagnostic
 * (accepted-plan: "surface event-log inconsistency as a non-fatal diagnostic"),
 * never as a parse failure.
 *
 * Also extracts structured finding dispositions from `review.finding.triaged`
 * events so the dashboard can show a disposition "when present" (accepted-spec)
 * without ever fabricating one for legacy free-form triage markdown.
 */

import { diag, type Diagnostic } from './diagnostics';
import { RECOGNIZED_DISPOSITIONS, type FindingDisposition } from './types';
import type { RunEvent } from '@semanticmatter/protocol';

const DISPOSITION_SET: ReadonlySet<string> = new Set(RECOGNIZED_DISPOSITIONS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function distinctForeign(values: Iterable<string>, expected: string): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (v && v !== expected && !out.includes(v)) {
      out.push(v);
    }
  }
  return out;
}

/**
 * Latest run-status asserted by the event log, from the most recent
 * `run.status.changed` event carrying a non-empty string `payload.status`.
 * Events are emitted in sequence order, so the last matching one wins. Returns
 * undefined when the log asserts no status (nothing to compare against).
 */
function latestEventLogStatus(events: readonly RunEvent[]): string | undefined {
  let status: string | undefined;
  for (const event of events) {
    if (event.type !== 'run.status.changed' || !isPlainObject(event.payload)) {
      continue;
    }
    const value = event.payload['status'];
    if (typeof value === 'string' && value.length > 0) {
      status = value;
    }
  }
  return status;
}

/**
 * Detect disagreement between run-state and the event log. Covers identity
 * (events claiming a different run or repository than the run-state they live
 * beside) and, when `expected.status` is given, status progression: the latest
 * `run.status.changed` asserting a status other than run-state's authoritative
 * one. One diagnostic per mismatch kind (not per event) to avoid noise. Every
 * disagreement is **non-fatal** — run-state always wins.
 *
 * Phase is intentionally not compared: the event log is optional and may
 * legitimately lag run-state's phase, which would produce false positives.
 * Status is the field accepted-plan names run-state as authoritative for, so a
 * stale or forked status assertion is worth surfacing.
 */
export function detectEventLogDisagreements(
  expected: { readonly runId: string; readonly repositoryId: string; readonly status?: string },
  events: readonly RunEvent[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (expected.runId) {
    const foreign = distinctForeign(
      events.map((e) => e.runId),
      expected.runId
    );
    if (foreign.length > 0) {
      diagnostics.push(
        diag(
          'event-log-disagreement',
          `events.jsonl contains events for run ${foreign.join(', ')} but run-state is ${expected.runId}; event log treated as supplementary, run-state is authoritative.`,
          'warning'
        )
      );
    }
  }

  if (expected.repositoryId) {
    const foreign = distinctForeign(
      events.map((e) => e.repositoryId),
      expected.repositoryId
    );
    if (foreign.length > 0) {
      diagnostics.push(
        diag(
          'event-log-disagreement',
          `events.jsonl contains events for repository ${foreign.join(', ')} but run-state repository is ${expected.repositoryId}.`,
          'warning'
        )
      );
    }
  }

  if (expected.status) {
    const eventStatus = latestEventLogStatus(events);
    if (eventStatus && eventStatus !== expected.status) {
      diagnostics.push(
        diag(
          'event-log-disagreement',
          `events.jsonl last reports status ${eventStatus} but run-state status is ${expected.status}; run-state is authoritative.`,
          'warning'
        )
      );
    }
  }

  return diagnostics;
}

/**
 * Build findingId → disposition from `review.finding.triaged` events. Only
 * dispositions in {@link RECOGNIZED_DISPOSITIONS} are accepted; unknown values
 * are ignored (forward-compatible). The latest triage for a finding wins.
 */
export function findingDispositionsFromEvents(
  events: readonly RunEvent[]
): Map<string, FindingDisposition> {
  const out = new Map<string, FindingDisposition>();
  for (const event of events) {
    if (event.type !== 'review.finding.triaged' || !isPlainObject(event.payload)) {
      continue;
    }
    const findingId = event.payload['findingId'];
    const disposition = event.payload['disposition'];
    if (
      typeof findingId === 'string' &&
      findingId.length > 0 &&
      typeof disposition === 'string' &&
      DISPOSITION_SET.has(disposition)
    ) {
      out.set(findingId, disposition);
    }
  }
  return out;
}
