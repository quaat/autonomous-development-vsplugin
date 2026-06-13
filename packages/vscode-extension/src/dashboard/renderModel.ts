/**
 * Map a loaded run (+ event log) into the serializable {@link DashboardView}.
 * Host-side and vscode-free so it stays unit-testable. Every workflow judgement
 * (stages, gates, next action, verification/review summaries) comes straight
 * from the core {@link WorkflowModel}; this module only reshapes and reads the
 * per-round review files for finding detail.
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  CONVENTIONAL_ARTIFACT_NAMES,
  countFindingsBySeverity,
  detectEventLogDisagreements,
  discoverTriageFiles,
  findingDispositionsFromEvents,
  parseReviewText,
  resolveArtifactPath,
  summarizeCodexArtifact,
  type DiscoveredRun,
  type FindingDisposition,
  type LoadedEventLog,
  type ReviewRef
} from '@semanticmatter/core';

import type {
  DashboardArtifact,
  DashboardDiagnostic,
  DashboardReviewRound,
  DashboardView
} from './viewTypes';

/**
 * Event-log diagnostics default to a warning; these codes are informational
 * (forward-compat / UI memory cap) rather than data problems.
 */
const INFO_EVENT_LOG_CODES = new Set(['future-schema-version', 'retention-truncated']);

/** Merge run-state and event-log diagnostics (core + protocol) for the dashboard. */
function collectDiagnostics(run: DiscoveredRun, eventLog: LoadedEventLog): DashboardDiagnostic[] {
  const out: DashboardDiagnostic[] = run.diagnostics.map((d) => ({
    code: d.code,
    message: d.message,
    severity: d.severity
  }));
  for (const d of eventLog.diagnostics) {
    out.push({ code: d.code, message: d.message, severity: d.severity });
  }
  // Non-fatal run-state vs event-log disagreement: identity + status (accepted-plan NFR).
  for (const d of detectEventLogDisagreements(
    {
      runId: run.state?.runId ?? '',
      repositoryId: run.repoId,
      ...(run.state?.status !== undefined ? { status: run.state.status } : {})
    },
    eventLog.events
  )) {
    out.push({ code: d.code, message: d.message, severity: d.severity });
  }
  for (const d of eventLog.protocolDiagnostics) {
    const where =
      d.line !== undefined
        ? ` (line ${d.line})`
        : d.sequence !== undefined
          ? ` (sequence ${d.sequence})`
          : '';
    out.push({
      code: d.code,
      message: `events.jsonl${where}: ${d.message}`,
      severity: INFO_EVENT_LOG_CODES.has(d.code) ? 'info' : 'warning'
    });
  }
  return out;
}

function fileExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function existsArtifact(
  runDir: string,
  ref: string | undefined,
  conventional: string
): { exists: boolean; filename: string; path: string } {
  if (ref) {
    const resolved = resolveArtifactPath(runDir, ref);
    if (resolved.path) {
      return { exists: fileExists(resolved.path), filename: ref, path: resolved.path };
    }
  }
  const path = join(runDir, conventional);
  return { exists: fileExists(path), filename: conventional, path };
}

function artifact(
  command: string,
  title: string,
  runDir: string,
  ref: string | undefined,
  conventional: string,
  summarize = false
): DashboardArtifact {
  const { exists, filename, path } = existsArtifact(runDir, ref, conventional);
  const sections = summarize && exists ? summarizeCodexArtifact(path) : [];
  return {
    command,
    title,
    exists,
    filename,
    ...(sections.length > 0 ? { sections } : {})
  };
}

function reviewRound(
  runDir: string,
  ref: ReviewRef,
  dispositions: ReadonlyMap<string, FindingDisposition>
): DashboardReviewRound {
  const base: { round?: number; path?: string; verdict?: string } = {};
  if (ref.round !== undefined) base.round = ref.round;
  if (ref.path !== undefined) base.path = ref.path;
  if (ref.verdict !== undefined) base.verdict = ref.verdict;

  const unreadable: DashboardReviewRound = {
    ...base,
    readable: false,
    findings: [],
    findingCountsBySeverity: {},
    verificationGaps: [],
    acceptanceCriteria: []
  };

  if (!ref.path) {
    return unreadable;
  }
  const resolved = resolveArtifactPath(runDir, ref.path);
  if (!resolved.path) {
    return unreadable;
  }
  let text: string;
  try {
    text = readFileSync(resolved.path, 'utf8');
  } catch {
    return unreadable;
  }
  const { document } = parseReviewText(text, resolved.path);
  if (!document) {
    return unreadable;
  }
  return {
    ...base,
    // File verdict wins over the cached ref verdict when present.
    ...(document.verdict !== undefined ? { verdict: document.verdict } : {}),
    ...(document.confidence !== undefined ? { confidence: document.confidence } : {}),
    ...(document.summary !== undefined ? { summary: document.summary } : {}),
    readable: true,
    findings: document.findings.map((f) => {
      const disposition = f.id !== undefined ? dispositions.get(f.id) : undefined;
      return {
        ...(f.id !== undefined ? { id: f.id } : {}),
        ...(f.severity !== undefined ? { severity: f.severity } : {}),
        ...(f.category !== undefined ? { category: f.category } : {}),
        ...(f.file !== undefined ? { file: f.file } : {}),
        ...(f.lineStart !== undefined ? { line: f.lineStart } : {}),
        ...(f.description !== undefined ? { description: f.description } : {}),
        ...(f.evidence !== undefined ? { evidence: f.evidence } : {}),
        ...(f.recommendedFix !== undefined ? { recommendedFix: f.recommendedFix } : {}),
        ...(disposition !== undefined ? { disposition } : {})
      };
    }),
    findingCountsBySeverity: countFindingsBySeverity(document),
    verificationGaps: [...document.verificationGaps],
    acceptanceCriteria: document.acceptanceCriteriaAssessment.map((a) => ({
      ...(a.id !== undefined ? { id: a.id } : {}),
      ...(a.status !== undefined ? { status: a.status } : {}),
      ...(a.evidence !== undefined ? { evidence: a.evidence } : {})
    }))
  };
}

/** Build the dashboard view for a run. Returns a diagnostics-only shell when unparsed. */
export function toDashboardView(run: DiscoveredRun, eventLog: LoadedEventLog): DashboardView {
  const diagnostics = collectDiagnostics(run, eventLog);
  const timeline = eventLog.timeline.map((e) => ({
    sequence: e.sequence,
    timestamp: e.timestamp,
    phase: e.phase,
    type: e.type,
    source: e.source,
    summary: e.summary
  }));

  const state = run.state;
  const model = run.model;
  if (!state || !model) {
    return {
      runId: run.runId,
      repoId: run.repoId,
      feature: '',
      status: 'unknown',
      phase: '',
      isTerminal: false,
      repository: { id: run.repoId },
      stages: [],
      reviewBudget: { max: 0, consumed: 0, remaining: 0 },
      verification: {
        hasChecks: false,
        passed: false,
        passedCount: 0,
        failedCount: 0,
        total: 0,
        checks: []
      },
      review: { hasReviews: false, severeFindingCount: 0, rounds: [], triageFiles: [] },
      adversarial: { required: false, satisfied: true, reasons: [], rounds: [] },
      risk: { requiresAdversarialReview: false, reasons: [] },
      gateFailures: [],
      gatesPass: false,
      nextAction: { code: 'none', message: '' },
      artifacts: [],
      timeline,
      truncatedTimeline: eventLog.truncatedTail,
      diagnostics
    };
  }

  const runDir = run.runDir;
  const dispositions = findingDispositionsFromEvents(eventLog.events);
  const artifacts: DashboardArtifact[] = [
    artifact(
      'autonomousDev.openOriginalFeature',
      'Original feature idea',
      runDir,
      state.artifacts.featureRequest,
      CONVENTIONAL_ARTIFACT_NAMES.featureRequest
    ),
    artifact(
      'autonomousDev.openEnhancedSpec',
      'Codex-enhanced specification',
      runDir,
      state.artifacts.enhance,
      CONVENTIONAL_ARTIFACT_NAMES.enhance,
      true
    ),
    artifact(
      'autonomousDev.openAcceptedSpec',
      'Claude-accepted specification',
      runDir,
      state.artifacts.acceptedSpec,
      CONVENTIONAL_ARTIFACT_NAMES.acceptedSpec
    ),
    artifact(
      'autonomousDev.openProposedPlan',
      'Codex-proposed plan',
      runDir,
      state.artifacts.plan,
      CONVENTIONAL_ARTIFACT_NAMES.plan,
      true
    ),
    artifact(
      'autonomousDev.openAcceptedPlan',
      'Claude-accepted plan',
      runDir,
      state.artifacts.acceptedPlan,
      CONVENTIONAL_ARTIFACT_NAMES.acceptedPlan
    )
  ];

  const checks = model.verification.latest.map((c) => ({
    name: c.name,
    command: c.command.join(' '),
    ...(c.exitCode !== undefined ? { exitCode: c.exitCode } : {}),
    passed: c.exitCode === 0,
    ...(c.startedAt !== undefined ? { startedAt: c.startedAt } : {}),
    ...(c.completedAt !== undefined ? { completedAt: c.completedAt } : {}),
    ...(c.log !== undefined ? { log: c.log } : {}),
    attempts: model.verification.attemptsByName[c.name]?.length ?? 1
  }));

  return {
    runId: state.runId,
    repoId: run.repoId,
    feature: state.feature,
    ...(state.label !== undefined ? { label: state.label } : {}),
    status: model.status,
    phase: model.phase,
    isTerminal: model.isTerminal,
    ...(model.blockingReason !== undefined ? { blockingReason: model.blockingReason } : {}),
    repository: {
      id: state.repository.id,
      ...(state.repository.displayName !== undefined
        ? { displayName: state.repository.displayName }
        : {}),
      ...(state.repository.worktreePath !== undefined
        ? { worktreePath: state.repository.worktreePath }
        : {}),
      ...(state.repository.remoteDisplay !== undefined
        ? { remoteDisplay: state.repository.remoteDisplay }
        : {})
    },
    ...(state.createdAt !== undefined ? { createdAt: state.createdAt } : {}),
    ...(state.updatedAt !== undefined ? { updatedAt: state.updatedAt } : {}),
    stages: model.stages.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      ...(s.detail !== undefined ? { detail: s.detail } : {})
    })),
    reviewBudget: model.reviewBudget,
    verification: {
      hasChecks: model.verification.hasChecks,
      passed: model.verification.passed,
      passedCount: model.verification.passedCount,
      failedCount: model.verification.failedCount,
      total: model.verification.total,
      checks
    },
    review: {
      hasReviews: model.review.hasReviews,
      ...(model.review.latestVerdict !== undefined
        ? { latestVerdict: model.review.latestVerdict }
        : {}),
      ...(model.review.latestRound !== undefined ? { latestRound: model.review.latestRound } : {}),
      severeFindingCount: model.review.severeFindingCount,
      rounds: state.reviews.map((r) => reviewRound(runDir, r, dispositions)),
      triageFiles: discoverTriageFiles(runDir).map((filename) => ({ filename }))
    },
    adversarial: {
      required: model.adversarial.required,
      satisfied: model.adversarial.satisfied,
      reasons: model.adversarial.reasons,
      rounds: state.adversarialReviews.map((r) => reviewRound(runDir, r, dispositions))
    },
    risk: model.riskClassification,
    gateFailures: model.completionGateFailures.map((g) => ({ code: g.code, message: g.message })),
    gatesPass: model.gatesPass,
    nextAction: model.recommendedNextAction,
    artifacts,
    timeline,
    truncatedTimeline: eventLog.truncatedTail,
    diagnostics
  };
}
