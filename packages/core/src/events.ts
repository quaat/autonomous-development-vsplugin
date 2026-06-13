/**
 * Load + reconstruct the append-only `events.jsonl` for a run, delegating
 * parsing/forward-compat to @semanticmatter/protocol. Run status always comes
 * from run-state.json (authoritative); the event log is a supplementary,
 * tolerant projection used for the dashboard's chronological view.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  parseEventLog,
  reconstructTimeline,
  type EventLogDiagnostic,
  type EventTimelineEntry,
  type ParseEventLogOptions,
  type PreservedRecord,
  type RunEvent
} from '@semanticmatter/protocol';

import { diag, type Diagnostic } from './diagnostics';
import { EVENT_LOG_FILENAME } from './loadRun';

export interface LoadedEventLog {
  readonly path: string;
  readonly exists: boolean;
  readonly events: readonly RunEvent[];
  readonly preserved: readonly PreservedRecord[];
  readonly timeline: readonly EventTimelineEntry[];
  readonly protocolDiagnostics: readonly EventLogDiagnostic[];
  readonly diagnostics: readonly Diagnostic[];
  readonly truncatedTail: boolean;
  readonly totalLines: number;
}

function empty(path: string, exists: boolean, diagnostics: Diagnostic[] = []): LoadedEventLog {
  return {
    path,
    exists,
    events: [],
    preserved: [],
    timeline: [],
    protocolDiagnostics: [],
    diagnostics,
    truncatedTail: false,
    totalLines: 0
  };
}

/** Read + reconstruct events.jsonl for a run directory (tolerant). */
export function loadEventLog(runDir: string, options: ParseEventLogOptions = {}): LoadedEventLog {
  const path = join(runDir, EVENT_LOG_FILENAME);
  if (!existsSync(path)) {
    return empty(path, false);
  }
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return empty(path, true, [
      diag('event-log-unreadable', `Could not read events.jsonl: ${message}`, 'warning', path)
    ]);
  }
  const parsed = parseEventLog(content, options);
  return {
    path,
    exists: true,
    events: parsed.events,
    preserved: parsed.preserved,
    timeline: reconstructTimeline(parsed.events),
    protocolDiagnostics: parsed.diagnostics,
    diagnostics: [],
    truncatedTail: parsed.truncatedTail,
    totalLines: parsed.totalLines
  };
}
