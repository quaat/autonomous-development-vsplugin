/**
 * RunEvent protocol — versioned, append-only event envelope for `events.jsonl`.
 *
 * Forward compatibility is a first-class requirement: unknown event `type`
 * values and unknown envelope fields are preserved and ignored, never rejected.
 * See `docs/PROTOCOL.md` and `resources/schemas/run-event.schema.json`.
 */

/** Current envelope schema version. Integer, bumped only on breaking changes. */
export const RUN_EVENT_SCHEMA_VERSION = 1 as const;

/**
 * Canonical event types known to v1. This list is **not** exhaustive at
 * runtime: a well-formed envelope carrying an unknown `type` is still valid and
 * is preserved verbatim for forward compatibility.
 */
export const KNOWN_EVENT_TYPES = [
  'run.created',
  'run.status.changed',
  'phase.started',
  'phase.completed',
  'phase.failed',
  'prompt.rendered',
  'prompt.reconciled',
  'artifact.created',
  'artifact.accepted',
  'agent.message.completed',
  'tool.started',
  'tool.completed',
  'file.change.proposed',
  'file.change.applied',
  'plan.step.started',
  'plan.step.completed',
  'plan.step.blocked',
  'verification.started',
  'verification.output',
  'verification.completed',
  'review.started',
  'review.finding.created',
  'review.finding.triaged',
  'review.finding.resolved',
  'review.completed',
  'gate.changed',
  'drift.detected',
  'approval.requested',
  'approval.resolved'
] as const;

export type KnownEventType = (typeof KNOWN_EVENT_TYPES)[number];

/**
 * An event `type` is a known type or any other string (forward-compatible).
 * The `Record<never, never>` intersection is the LiteralUnion idiom: it keeps
 * known-type autocomplete without collapsing the union to bare `string`.
 */
export type RunEventType = KnownEventType | (string & Record<never, never>);

const KNOWN_EVENT_TYPE_SET: ReadonlySet<string> = new Set(KNOWN_EVENT_TYPES);

export function isKnownEventType(type: string): type is KnownEventType {
  return KNOWN_EVENT_TYPE_SET.has(type);
}

/** Common, non-exhaustive set of event sources. Other strings are allowed. */
export type RunEventSource =
  | 'controller'
  | 'extension'
  | 'claude-agent'
  | 'codex'
  | (string & Record<never, never>);

/**
 * The append-only RunEvent envelope. `payload` is intentionally `unknown`:
 * consumers narrow it per `type`. Unknown extra fields are retained in
 * {@link RunEvent.extra} by the parser so nothing is silently dropped.
 */
export interface RunEvent {
  readonly schemaVersion: number;
  readonly sequence: number;
  readonly timestamp: string;
  readonly runId: string;
  readonly repositoryId: string;
  readonly phase: string;
  readonly source: RunEventSource;
  readonly type: RunEventType;
  readonly correlationId?: string;
  readonly payload: unknown;
  /** Envelope fields not part of this version's schema, preserved verbatim. */
  readonly extra?: Readonly<Record<string, unknown>>;
}

/** Envelope field names defined by this schema version. */
export const RUN_EVENT_ENVELOPE_KEYS = [
  'schemaVersion',
  'sequence',
  'timestamp',
  'runId',
  'repositoryId',
  'phase',
  'source',
  'type',
  'correlationId',
  'payload'
] as const;
