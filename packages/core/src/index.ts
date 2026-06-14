/**
 * @semanticmatter/core — VS Code-free workflow semantics for the SemanticMatter
 * Autonomous Development extension. Never imports the vscode API; depends only
 * on @semanticmatter/protocol and Node built-ins.
 *
 * The shared workflow evaluator (completion gates + recommended next action)
 * lives here exactly once; every UI surface consumes it.
 */

export type {
  RunStatus,
  RunGroup,
  RepositoryInfo,
  BaselineInfo,
  ArtifactMap,
  VerificationCheck,
  VerificationState,
  ReviewRef,
  RiskInfo,
  RunState,
  ReviewFinding,
  ReviewDocument,
  AcceptanceCriterionAssessment,
  FindingDisposition
} from './types';
export { TERMINAL_STATUSES, SEVERE_FINDING_SEVERITIES, RECOGNIZED_DISPOSITIONS } from './types';

export { diag, type Diagnostic, type DiagnosticCode, type DiagnosticSeverity } from './diagnostics';

export {
  resolveStateHome,
  expandUser,
  LEGACY_LAYOUT_RELATIVE,
  type StateHomeOptions
} from './stateHome';

export {
  normalizeRunState,
  parseRunStateText,
  normalizeStatus,
  type RunStateParseResult
} from './runState';

export {
  resolveArtifactPath,
  confineToDirectory,
  CONVENTIONAL_ARTIFACT_NAMES,
  type ArtifactResolution
} from './artifacts';

export {
  summarizeCodexArtifact,
  summarizeCodexArtifactValue,
  type CodexArtifactSection
} from './codexArtifact';

export { computeRepoId } from './repoId';

export { redactCredentials } from './redact';

export { detectEventLogDisagreements, findingDispositionsFromEvents } from './consistency';

export {
  loadRun,
  buildModel,
  evaluateRunStateText,
  RUN_STATE_FILENAME,
  EVENT_LOG_FILENAME,
  type LoadedRun
} from './loadRun';

export {
  discoverRepositories,
  discoverRuns,
  discoverTriageFiles,
  runsInGroup,
  groupForStatus,
  detectLegacyRun,
  type DiscoveredRun,
  type DiscoveredRepository
} from './runDiscovery';

export { loadEventLog, type LoadedEventLog } from './events';

// Workflow model + the single-source gate/next-action derivations.
export {
  evaluateWorkflow,
  type EvaluatorInput,
  type LatestReviewFacts,
  type WorkflowModel,
  type ReviewBudget,
  type ReviewSummaryModel,
  type AdversarialSummaryModel
} from './workflow/evaluator';
export { summarizeVerification, type VerificationSummary } from './workflow/verification';
export {
  latestReviewRef,
  normalizeReviewDocument,
  parseReviewText,
  isSevereFinding,
  countSevereFindings,
  countFindingsBySeverity,
  type ReviewDocumentParseResult
} from './workflow/reviews';
export {
  evaluateGates,
  gatesPass,
  type GateFailure,
  type GateFailureCode,
  type GateFacts
} from './workflow/gates';
export {
  recommendNextAction,
  nextAction,
  type NextAction,
  type NextActionCode,
  type NextActionFacts
} from './workflow/nextAction';
export {
  deriveStages,
  type WorkflowStage,
  type StageId,
  type StageStatus,
  type StageFacts
} from './workflow/stages';

// Controller adapter argv construction (pure; spawning happens in the host).
export {
  buildControllerCommand,
  isMutatingSubcommand,
  type ControllerSubcommand,
  type ControllerContext,
  type ControllerOptions,
  type ControllerCommandLine
} from './controller/args';

// Future live-integration adapter contracts (no implementations this release).
export type {
  AdapterKind,
  AdapterDescriptor,
  RunEventSink,
  RunEventSource,
  ClaudeAgentAdapter,
  CodexAppServerAdapter
} from './adapters/index';
export { CLAUDE_AGENT_DESCRIPTOR, CODEX_APP_SERVER_DESCRIPTOR } from './adapters/index';

// Re-export the protocol surface so extension code can import from one place.
export {
  RUN_EVENT_SCHEMA_VERSION,
  KNOWN_EVENT_TYPES,
  RUN_EVENT_ENVELOPE_KEYS,
  isKnownEventType,
  validateRunEvent,
  isCurrentSchemaVersion,
  parseEventLog,
  reconstructTimeline,
  type KnownEventType,
  type RunEventType,
  type RunEventSource as RunEventEmitterSource,
  type RunEvent,
  type ValidationIssue,
  type ValidationResult,
  type ParseEventLogOptions,
  type ParsedEventLog,
  type EventLogDiagnostic,
  type EventLogDiagnosticCode,
  type PreservedRecord,
  type EventTimelineEntry
} from '@semanticmatter/protocol';
