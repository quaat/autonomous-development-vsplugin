/**
 * Domain types mirroring the quaat/autonomous-development `run-state.json`
 * (schema_version 2, with legacy v1 tolerated). See docs/REFERENCE.md §3.
 *
 * These are the *normalized* shapes the rest of core consumes. Raw JSON is
 * preserved on `RunState.raw` for forward compatibility.
 */

/** Normalized run status. Unknown strings collapse to `'unknown'`. */
export type RunStatus = 'active' | 'complete' | 'blocked' | 'cancelled' | 'archived' | 'unknown';

/** Terminal statuses never transition further. */
export const TERMINAL_STATUSES: readonly RunStatus[] = [
  'complete',
  'blocked',
  'cancelled',
  'archived'
];

/** Which of the three native tree views a run belongs to. */
export type RunGroup = 'active' | 'completed' | 'archived';

export interface RepositoryInfo {
  readonly id: string;
  readonly canonicalRoot?: string;
  readonly gitCommonDir?: string;
  readonly worktreePath?: string;
  readonly displayName?: string;
  /** Credential-stripped remote, as recorded by the controller. */
  readonly remoteDisplay?: string;
}

export interface BaselineInfo {
  readonly commit?: string;
  readonly branch?: string;
  readonly dirtyEntriesAtInit: readonly string[];
}

/** Known artifact keys, plus the verbatim map for forward compatibility. */
export interface ArtifactMap {
  readonly featureRequest?: string;
  readonly repositoryContext?: string;
  readonly enhance?: string;
  readonly acceptedSpec?: string;
  readonly plan?: string;
  readonly acceptedPlan?: string;
  readonly review?: string;
  readonly adversarial?: string;
  readonly raw: Readonly<Record<string, string>>;
}

export interface VerificationCheck {
  readonly name: string;
  readonly command: readonly string[];
  /** Absent while a check is mid-flight. */
  readonly exitCode?: number;
  readonly log?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export interface VerificationState {
  /** The run-state cached `passed` flag (advisory; we recompute, §5). */
  readonly passedFlag?: boolean;
  readonly checks: readonly VerificationCheck[];
}

export interface ReviewRef {
  readonly round?: number;
  readonly path?: string;
  readonly verdict?: string;
}

export interface RiskInfo {
  readonly requiresAdversarialReview: boolean;
  readonly reasons: readonly string[];
}

export interface RunState {
  /** 1 or 2 when recognized; 0 when absent/unparseable. */
  readonly schemaVersion: number;
  readonly runId: string;
  readonly label?: string;
  readonly feature: string;
  readonly status: RunStatus;
  /** Original status string before normalization (for display/debugging). */
  readonly rawStatus: string;
  readonly phase: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly repository: RepositoryInfo;
  readonly baseline?: BaselineInfo;
  readonly maxReviewRounds: number;
  readonly reviewRound: number;
  readonly stopGateBlocks: number;
  readonly artifacts: ArtifactMap;
  readonly verification: VerificationState;
  readonly reviews: readonly ReviewRef[];
  readonly adversarialReviews: readonly ReviewRef[];
  readonly risk: RiskInfo;
  readonly notes: readonly string[];
  readonly completionGateFailures: readonly string[];
  /** Everything as parsed, for forward compatibility / debugging. */
  readonly raw: Readonly<Record<string, unknown>>;
}

/** Severity buckets the completion gate treats as "severe" (§6 #7). */
export const SEVERE_FINDING_SEVERITIES: readonly string[] = ['critical', 'high'];

/**
 * Structured finding dispositions the dashboard recognizes (docs/REFERENCE.md §9).
 * These are mapped from structured triage content or future live events — never
 * fabricated from free-form legacy `triage-NN.md`, which is shown read-only.
 */
export const RECOGNIZED_DISPOSITIONS: readonly string[] = [
  'accepted',
  'rejected_with_evidence',
  'already_resolved',
  'out_of_scope_but_recorded',
  'requires_human_decision'
];

export type FindingDisposition = (typeof RECOGNIZED_DISPOSITIONS)[number];

/** A single finding inside a review-NN.codex.json (subset we rely on). */
export interface ReviewFinding {
  readonly id?: string;
  readonly severity?: string;
  readonly category?: string;
  readonly file?: string | null;
  readonly lineStart?: number | null;
  readonly description?: string;
  readonly evidence?: string;
  readonly recommendedFix?: string;
}

/** One acceptance-criterion verdict from `acceptance_criteria_assessment[]` (§8). */
export interface AcceptanceCriterionAssessment {
  readonly id?: string;
  /** satisfied | partially_satisfied | not_satisfied | not_verifiable. */
  readonly status?: string;
  readonly evidence?: string;
}

export interface ReviewDocument {
  readonly verdict?: string;
  readonly summary?: string;
  readonly confidence?: number;
  readonly findings: readonly ReviewFinding[];
  /** `verification_gaps[]` — free-text gaps the reviewer could not confirm. */
  readonly verificationGaps: readonly string[];
  /** `acceptance_criteria_assessment[]` — per-criterion satisfaction verdicts. */
  readonly acceptanceCriteriaAssessment: readonly AcceptanceCriterionAssessment[];
  readonly raw: Readonly<Record<string, unknown>>;
}
