/**
 * Tolerant reader for the append-only `events.jsonl` log.
 *
 * Guarantees:
 * - a truncated/partial final line (interrupted write) is tolerated, not fatal;
 * - malformed interior lines produce diagnostics but never abort the parse;
 * - unknown future event `type` values are valid and preserved;
 * - objects carrying a non-current `schemaVersion` are preserved (not dropped)
 *   rather than misread as v1;
 * - duplicate sequence numbers are de-duplicated (first occurrence wins);
 * - non-monotonic sequences are surfaced as non-fatal diagnostics;
 * - in-memory retention is bounded by `maxEntries` (most recent retained).
 */

import { validateRunEvent, isCurrentSchemaVersion } from './schema';
import type { RunEvent } from './events';

export type EventLogDiagnosticCode =
  | 'parse-error'
  | 'invalid-envelope'
  | 'non-object'
  | 'truncated-tail'
  | 'sequence-nonmonotonic'
  | 'duplicate-sequence'
  | 'future-schema-version'
  | 'retention-truncated';

export interface EventLogDiagnostic {
  readonly code: EventLogDiagnosticCode;
  readonly message: string;
  /** 1-based source line number, when the diagnostic relates to a line. */
  readonly line?: number;
  readonly sequence?: number;
}

/** A structurally-valid object that is not a v1 RunEvent, retained verbatim. */
export interface PreservedRecord {
  readonly line: number;
  readonly raw: Readonly<Record<string, unknown>>;
  readonly reason: string;
}

export interface ParseEventLogOptions {
  /** Maximum number of valid events retained in memory (most recent kept). */
  readonly maxEntries?: number;
}

export interface ParsedEventLog {
  readonly events: readonly RunEvent[];
  readonly diagnostics: readonly EventLogDiagnostic[];
  readonly preserved: readonly PreservedRecord[];
  readonly totalLines: number;
  readonly truncatedTail: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function signatureOf(event: RunEvent): string {
  return JSON.stringify([event.type, event.timestamp, event.source, event.phase, event.payload]);
}

export function parseEventLog(content: string, options: ParseEventLogOptions = {}): ParsedEventLog {
  const diagnostics: EventLogDiagnostic[] = [];
  const preserved: PreservedRecord[] = [];
  const accepted: RunEvent[] = [];

  const endsWithNewline = content.length === 0 || content.endsWith('\n');
  const rawLines = content.split('\n');
  // A trailing newline yields a final empty element; drop it so it is not the
  // "final line" considered for truncation.
  if (endsWithNewline && rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
    rawLines.pop();
  }

  const totalLines = rawLines.length;
  let truncatedTail = false;

  const seenBySequence = new Map<string, RunEvent>();
  let previousSequence: number | undefined;

  for (let i = 0; i < rawLines.length; i++) {
    const lineNumber = i + 1;
    const text = rawLines[i] ?? '';
    if (text.trim().length === 0) {
      continue;
    }

    const isFinalLine = i === rawLines.length - 1;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      if (isFinalLine && !endsWithNewline) {
        truncatedTail = true;
        diagnostics.push({
          code: 'truncated-tail',
          message: 'final line is incomplete (interrupted write); tolerated and skipped',
          line: lineNumber
        });
      } else {
        diagnostics.push({
          code: 'parse-error',
          message: 'line is not valid JSON; skipped',
          line: lineNumber
        });
      }
      continue;
    }

    if (!isPlainObject(parsed)) {
      diagnostics.push({
        code: 'non-object',
        message: 'line is valid JSON but not an object; skipped',
        line: lineNumber
      });
      continue;
    }

    if (!isCurrentSchemaVersion(parsed)) {
      preserved.push({
        line: lineNumber,
        raw: parsed,
        reason: 'non-current schemaVersion; preserved for forward compatibility'
      });
      diagnostics.push({
        code: 'future-schema-version',
        message: `object schemaVersion is not the current version; preserved, not parsed as v1`,
        line: lineNumber
      });
      continue;
    }

    const result = validateRunEvent(parsed);
    if (!result.valid || !result.event) {
      preserved.push({
        line: lineNumber,
        raw: parsed,
        reason: 'failed v1 envelope validation; preserved verbatim'
      });
      diagnostics.push({
        code: 'invalid-envelope',
        message: `invalid RunEvent envelope: ${result.issues.map((x) => `${x.path}: ${x.message}`).join('; ')}`,
        line: lineNumber
      });
      continue;
    }

    const event = result.event;
    const key = `${event.runId}#${event.sequence}`;
    const existing = seenBySequence.get(key);
    if (existing) {
      const conflicting = signatureOf(existing) !== signatureOf(event);
      diagnostics.push({
        code: 'duplicate-sequence',
        message: conflicting
          ? 'duplicate sequence with differing content; first occurrence kept'
          : 'duplicate sequence; later occurrence dropped',
        line: lineNumber,
        sequence: event.sequence
      });
      continue;
    }

    if (previousSequence !== undefined && event.sequence <= previousSequence) {
      diagnostics.push({
        code: 'sequence-nonmonotonic',
        message: `sequence ${event.sequence} does not exceed previous ${previousSequence}`,
        line: lineNumber,
        sequence: event.sequence
      });
    }

    seenBySequence.set(key, event);
    previousSequence = event.sequence;
    accepted.push(event);
  }

  let events: RunEvent[] = accepted;
  const maxEntries = options.maxEntries;
  if (typeof maxEntries === 'number' && maxEntries >= 0 && accepted.length > maxEntries) {
    const dropped = accepted.length - maxEntries;
    events = accepted.slice(accepted.length - maxEntries);
    diagnostics.push({
      code: 'retention-truncated',
      message: `retained the most recent ${maxEntries} of ${accepted.length} events (${dropped} older events dropped from memory)`
    });
  }

  return { events, diagnostics, preserved, totalLines, truncatedTail };
}
