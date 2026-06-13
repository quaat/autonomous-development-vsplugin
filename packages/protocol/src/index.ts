/**
 * @semanticmatter/protocol — versioned RunEvent protocol for the append-only
 * `events.jsonl` log. No third-party runtime dependencies; never imports vscode.
 */

export {
  RUN_EVENT_SCHEMA_VERSION,
  KNOWN_EVENT_TYPES,
  RUN_EVENT_ENVELOPE_KEYS,
  isKnownEventType,
  type KnownEventType,
  type RunEventType,
  type RunEventSource,
  type RunEvent
} from './events';

export {
  validateRunEvent,
  isCurrentSchemaVersion,
  type ValidationIssue,
  type ValidationResult
} from './schema';

export {
  parseEventLog,
  type ParseEventLogOptions,
  type ParsedEventLog,
  type EventLogDiagnostic,
  type EventLogDiagnosticCode,
  type PreservedRecord
} from './jsonl';

export { reconstructTimeline, type EventTimelineEntry } from './timeline';
