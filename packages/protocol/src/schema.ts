/**
 * Hand-rolled, dependency-free validator for the {@link RunEvent} envelope.
 *
 * The protocol package must not pull third-party runtime dependencies, so we do
 * not use a JSON Schema engine (e.g. ajv) at runtime. The canonical JSON Schema
 * lives at `resources/schemas/run-event.schema.json` for documentation and
 * external tooling; this validator enforces the same envelope contract in code.
 */

import {
  RUN_EVENT_ENVELOPE_KEYS,
  RUN_EVENT_SCHEMA_VERSION,
  type RunEvent,
  type RunEventSource,
  type RunEventType
} from './events';

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
  /** Present iff {@link ValidationResult.valid} is true. */
  readonly event?: RunEvent;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

const ENVELOPE_KEY_SET: ReadonlySet<string> = new Set(RUN_EVENT_ENVELOPE_KEYS);

/**
 * Validate an arbitrary parsed JSON value as a v1 RunEvent envelope.
 *
 * Forward compatibility: an unknown `type` is accepted (preserved), and unknown
 * extra envelope fields are accepted and captured into `event.extra`. A
 * `schemaVersion` other than the current version is rejected here — the JSONL
 * reader preserves such records separately rather than misreading them as v1.
 */
export function validateRunEvent(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isPlainObject(value)) {
    return { valid: false, issues: [{ path: '', message: 'event must be a JSON object' }] };
  }

  const v = value;

  if (v['schemaVersion'] !== RUN_EVENT_SCHEMA_VERSION) {
    issues.push({
      path: 'schemaVersion',
      message: `schemaVersion must be the integer ${RUN_EVENT_SCHEMA_VERSION}`
    });
  }

  const sequence = v['sequence'];
  if (typeof sequence !== 'number' || !Number.isInteger(sequence) || sequence < 0) {
    issues.push({ path: 'sequence', message: 'sequence must be a non-negative integer' });
  }

  if (!isNonEmptyString(v['timestamp'])) {
    issues.push({ path: 'timestamp', message: 'timestamp must be a non-empty string' });
  }
  if (!isNonEmptyString(v['runId'])) {
    issues.push({ path: 'runId', message: 'runId must be a non-empty string' });
  }
  if (!isNonEmptyString(v['repositoryId'])) {
    issues.push({ path: 'repositoryId', message: 'repositoryId must be a non-empty string' });
  }
  if (typeof v['phase'] !== 'string') {
    issues.push({ path: 'phase', message: 'phase must be a string' });
  }
  if (!isNonEmptyString(v['source'])) {
    issues.push({ path: 'source', message: 'source must be a non-empty string' });
  }
  if (!isNonEmptyString(v['type'])) {
    issues.push({ path: 'type', message: 'type must be a non-empty string' });
  }
  if (!('payload' in v)) {
    issues.push({ path: 'payload', message: 'payload is required (may be null)' });
  }
  if (
    'correlationId' in v &&
    v['correlationId'] !== undefined &&
    typeof v['correlationId'] !== 'string'
  ) {
    issues.push({ path: 'correlationId', message: 'correlationId must be a string when present' });
  }

  if (issues.length > 0) {
    return { valid: false, issues };
  }

  const extra: Record<string, unknown> = {};
  for (const key of Object.keys(v)) {
    if (!ENVELOPE_KEY_SET.has(key)) {
      extra[key] = v[key];
    }
  }

  const event: RunEvent = {
    schemaVersion: RUN_EVENT_SCHEMA_VERSION,
    sequence: sequence as number,
    timestamp: v['timestamp'] as string,
    runId: v['runId'] as string,
    repositoryId: v['repositoryId'] as string,
    phase: v['phase'] as string,
    source: v['source'] as RunEventSource,
    type: v['type'] as RunEventType,
    payload: v['payload'],
    ...(isNonEmptyString(v['correlationId']) ? { correlationId: v['correlationId'] } : {}),
    ...(Object.keys(extra).length > 0 ? { extra } : {})
  };

  return { valid: true, issues: [], event };
}

/** Whether a parsed object carries a recognized v1 schemaVersion. */
export function isCurrentSchemaVersion(value: unknown): boolean {
  return isPlainObject(value) && value['schemaVersion'] === RUN_EVENT_SCHEMA_VERSION;
}
