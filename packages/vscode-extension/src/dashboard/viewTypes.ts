/**
 * Serializable view model posted to the dashboard webview. Plain interfaces with
 * no imports so both the host mapper (renderModel.ts) and the webview script
 * (webview/main.ts) can share them without coupling the webview bundle to core
 * or vscode. Every derived value (stages, gates, next action) originates from
 * @semanticmatter/core and is only passed through here.
 */

/** One semantic-summary section of a structured Codex JSON artifact (§ "Prompt and artifact evolution"). */
export interface DashboardArtifactSummarySection {
  readonly label: string;
  readonly items: readonly string[];
}

export interface DashboardArtifact {
  /** Command id suffix, e.g. "openEnhancedSpec"; the webview asks the host to run it. */
  readonly command: string;
  readonly title: string;
  readonly exists: boolean;
  readonly filename?: string;
  /** Semantic summary of a structured Codex JSON artifact, when one is available. */
  readonly sections?: readonly DashboardArtifactSummarySection[];
}

export interface DashboardStage {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly detail?: string;
}

export interface DashboardGate {
  readonly code: string;
  readonly message: string;
}

export interface DashboardCheck {
  readonly name: string;
  readonly command: string;
  readonly exitCode?: number;
  readonly passed: boolean;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly log?: string;
  readonly attempts: number;
}

export interface DashboardFinding {
  readonly id?: string;
  readonly severity?: string;
  readonly category?: string;
  readonly file?: string | null;
  readonly line?: number | null;
  readonly description?: string;
  readonly evidence?: string;
  readonly recommendedFix?: string;
  /** Structured disposition from a review.finding.triaged event, when present (§9). */
  readonly disposition?: string;
}

export interface DashboardAcceptanceCriterion {
  readonly id?: string;
  readonly status?: string;
  readonly evidence?: string;
}

export interface DashboardReviewRound {
  readonly round?: number;
  readonly path?: string;
  readonly verdict?: string;
  readonly confidence?: number;
  readonly readable: boolean;
  readonly summary?: string;
  readonly findings: readonly DashboardFinding[];
  readonly findingCountsBySeverity: Readonly<Record<string, number>>;
  readonly verificationGaps: readonly string[];
  readonly acceptanceCriteria: readonly DashboardAcceptanceCriterion[];
}

/** A read-only legacy triage markdown file (no fabricated dispositions; §9). */
export interface DashboardTriageFile {
  readonly filename: string;
}

export interface DashboardTimelineEntry {
  readonly sequence: number;
  readonly timestamp: string;
  readonly phase: string;
  readonly type: string;
  readonly source: string;
  readonly summary: string;
}

export interface DashboardDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: string;
}

export interface DashboardView {
  readonly runId: string;
  readonly repoId: string;
  readonly feature: string;
  readonly label?: string;
  readonly status: string;
  readonly phase: string;
  readonly isTerminal: boolean;
  readonly blockingReason?: string;
  readonly repository: {
    readonly id: string;
    readonly displayName?: string;
    readonly worktreePath?: string;
    readonly remoteDisplay?: string;
  };
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly stages: readonly DashboardStage[];
  readonly reviewBudget: {
    readonly max: number;
    readonly consumed: number;
    readonly remaining: number;
  };
  readonly verification: {
    readonly hasChecks: boolean;
    readonly passed: boolean;
    readonly passedCount: number;
    readonly failedCount: number;
    readonly total: number;
    readonly checks: readonly DashboardCheck[];
  };
  readonly review: {
    readonly hasReviews: boolean;
    readonly latestVerdict?: string;
    readonly latestRound?: number;
    readonly severeFindingCount: number;
    readonly rounds: readonly DashboardReviewRound[];
    readonly triageFiles: readonly DashboardTriageFile[];
  };
  readonly adversarial: {
    readonly required: boolean;
    readonly satisfied: boolean;
    readonly reasons: readonly string[];
    readonly rounds: readonly DashboardReviewRound[];
  };
  readonly risk: {
    readonly requiresAdversarialReview: boolean;
    readonly reasons: readonly string[];
  };
  readonly gateFailures: readonly DashboardGate[];
  readonly gatesPass: boolean;
  readonly nextAction: { readonly code: string; readonly message: string };
  readonly artifacts: readonly DashboardArtifact[];
  readonly timeline: readonly DashboardTimelineEntry[];
  readonly truncatedTimeline: boolean;
  readonly diagnostics: readonly DashboardDiagnostic[];
}

/** Messages the webview sends to the host. */
export type WebviewMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'command'; readonly command: string }
  | { readonly type: 'openFinding'; readonly file: string; readonly line?: number | null }
  | { readonly type: 'openVerificationLog'; readonly log: string }
  | { readonly type: 'openRunFile'; readonly file: string };
