/**
 * Non-fatal diagnostics produced while reading possibly-malformed or
 * partially-written state. The UI shows these and retains the last valid view
 * rather than crashing.
 */

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticCode =
  | 'run-state-unreadable'
  | 'run-state-parse-error'
  | 'run-state-not-object'
  | 'run-state-missing-run-id'
  | 'run-state-missing-status'
  | 'run-state-unknown-status'
  | 'run-state-unsupported-schema-version'
  | 'run-state-field-type'
  | 'metadata-unreadable'
  | 'review-unreadable'
  | 'review-parse-error'
  | 'artifact-path-escapes-run-dir'
  | 'event-log-unreadable'
  | 'event-log-disagreement';

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly severity: DiagnosticSeverity;
  /** File path or dotted field path the diagnostic relates to, when relevant. */
  readonly path?: string;
}

export function diag(
  code: DiagnosticCode,
  message: string,
  severity: DiagnosticSeverity = 'warning',
  path?: string
): Diagnostic {
  return path === undefined ? { code, message, severity } : { code, message, severity, path };
}
