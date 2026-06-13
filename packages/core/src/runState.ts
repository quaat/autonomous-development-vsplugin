/**
 * Tolerant parsing/normalization of `run-state.json` (docs/REFERENCE.md §3).
 *
 * A malformed or partially-written file must never throw to the caller: it
 * returns diagnostics and (when at all possible) a best-effort normalized state.
 * Only `run_id` + `status` are strictly required for a usable run (§3).
 */

import { diag, type Diagnostic } from './diagnostics';
import { redactCredentials } from './redact';
import type {
  ArtifactMap,
  BaselineInfo,
  RepositoryInfo,
  ReviewRef,
  RiskInfo,
  RunState,
  RunStatus,
  VerificationCheck,
  VerificationState
} from './types';

export interface RunStateParseResult {
  readonly state?: RunState;
  readonly diagnostics: readonly Diagnostic[];
}

const SUPPORTED_SCHEMA_VERSIONS = new Set([1, 2]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v): v is string => typeof v === 'string');
}

/** Normalize a status string to the {@link RunStatus} union. */
export function normalizeStatus(raw: string): RunStatus {
  switch (raw.trim().toLowerCase()) {
    case 'active':
    case 'in_progress':
    case 'running':
      return 'active';
    case 'complete':
    case 'completed':
      return 'complete';
    case 'blocked':
      return 'blocked';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'archived':
      return 'archived';
    default:
      return 'unknown';
  }
}

function normalizeRepository(value: unknown): RepositoryInfo {
  if (!isPlainObject(value)) {
    return { id: '' };
  }
  const info: {
    id: string;
    canonicalRoot?: string;
    gitCommonDir?: string;
    worktreePath?: string;
    displayName?: string;
    remoteDisplay?: string;
  } = { id: asString(value['id']) ?? '' };
  const canonicalRoot = asNonEmptyString(value['canonical_root']);
  if (canonicalRoot) info.canonicalRoot = canonicalRoot;
  const gitCommonDir = asNonEmptyString(value['git_common_dir']);
  if (gitCommonDir) info.gitCommonDir = gitCommonDir;
  const worktreePath = asNonEmptyString(value['worktree_path']);
  if (worktreePath) info.worktreePath = worktreePath;
  const displayName = asNonEmptyString(value['display_name']);
  if (displayName) info.displayName = displayName;
  const remoteDisplay = asNonEmptyString(value['remote_display']);
  if (remoteDisplay) info.remoteDisplay = redactCredentials(remoteDisplay);
  return info;
}

function normalizeBaseline(value: unknown): BaselineInfo | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const baseline: { commit?: string; branch?: string; dirtyEntriesAtInit: string[] } = {
    dirtyEntriesAtInit: asStringArray(value['dirty_entries_at_init'])
  };
  const commit = asNonEmptyString(value['commit']);
  if (commit) baseline.commit = commit;
  const branch = asNonEmptyString(value['branch']);
  if (branch) baseline.branch = branch;
  return baseline;
}

const KNOWN_ARTIFACT_KEYS: ReadonlyArray<[keyof Omit<ArtifactMap, 'raw'>, string]> = [
  ['featureRequest', 'feature_request'],
  ['repositoryContext', 'repository_context'],
  ['enhance', 'enhance'],
  ['acceptedSpec', 'accepted_spec'],
  ['plan', 'plan'],
  ['acceptedPlan', 'accepted_plan'],
  ['review', 'review'],
  ['adversarial', 'adversarial']
];

function normalizeArtifacts(value: unknown): ArtifactMap {
  const raw: Record<string, string> = {};
  if (isPlainObject(value)) {
    for (const [key, v] of Object.entries(value)) {
      const s = asNonEmptyString(v);
      if (s) {
        raw[key] = s;
      }
    }
  }
  const known: Partial<Record<keyof Omit<ArtifactMap, 'raw'>, string>> = {};
  for (const [camel, snake] of KNOWN_ARTIFACT_KEYS) {
    const s = raw[snake];
    if (s) {
      known[camel] = s;
    }
  }
  return { ...known, raw };
}

function normalizeCheck(value: unknown): VerificationCheck | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const name = asString(value['name']);
  if (name === undefined) {
    return undefined;
  }
  const rawCommand = value['command'];
  const command = Array.isArray(rawCommand)
    ? rawCommand.filter((v): v is string => typeof v === 'string')
    : typeof rawCommand === 'string'
      ? [rawCommand]
      : [];
  const check: {
    name: string;
    command: string[];
    exitCode?: number;
    log?: string;
    startedAt?: string;
    completedAt?: string;
  } = { name, command };
  const exitCode = asNumber(value['exit_code']);
  if (exitCode !== undefined) check.exitCode = exitCode;
  const log = asNonEmptyString(value['log']);
  if (log) check.log = log;
  const startedAt = asNonEmptyString(value['started_at']);
  if (startedAt) check.startedAt = startedAt;
  const completedAt = asNonEmptyString(value['completed_at']);
  if (completedAt) check.completedAt = completedAt;
  return check;
}

function normalizeVerification(value: unknown): VerificationState {
  if (!isPlainObject(value)) {
    return { checks: [] };
  }
  const checks: VerificationCheck[] = [];
  const rawChecks = value['checks'];
  if (Array.isArray(rawChecks)) {
    for (const entry of rawChecks) {
      const check = normalizeCheck(entry);
      if (check) {
        checks.push(check);
      }
    }
  }
  const state: { passedFlag?: boolean; checks: VerificationCheck[] } = { checks };
  if (typeof value['passed'] === 'boolean') {
    state.passedFlag = value['passed'];
  }
  return state;
}

function normalizeReviewRefs(value: unknown): ReviewRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const refs: ReviewRef[] = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) {
      continue;
    }
    const ref: { round?: number; path?: string; verdict?: string } = {};
    const round = asNumber(entry['round']);
    if (round !== undefined) ref.round = round;
    const path = asNonEmptyString(entry['path']);
    if (path) ref.path = path;
    const verdict = asNonEmptyString(entry['verdict']);
    if (verdict) ref.verdict = verdict;
    refs.push(ref);
  }
  return refs;
}

function normalizeRisk(value: unknown): RiskInfo {
  if (!isPlainObject(value)) {
    return { requiresAdversarialReview: false, reasons: [] };
  }
  return {
    requiresAdversarialReview: value['requires_adversarial_review'] === true,
    reasons: asStringArray(value['reasons'])
  };
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) {
    return fallback;
  }
  const i = Math.trunc(value);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

/** Normalize already-parsed JSON into a {@link RunState}. */
export function normalizeRunState(value: unknown): RunStateParseResult {
  const diagnostics: Diagnostic[] = [];

  if (!isPlainObject(value)) {
    diagnostics.push(diag('run-state-not-object', 'run-state.json is not a JSON object', 'error'));
    return { diagnostics };
  }

  const runId = asNonEmptyString(value['run_id']);
  if (runId === undefined) {
    diagnostics.push(
      diag('run-state-missing-run-id', 'run-state.json has no string "run_id"', 'error', 'run_id')
    );
    return { diagnostics };
  }

  const rawStatus = asString(value['status']);
  if (rawStatus === undefined) {
    diagnostics.push(
      diag('run-state-missing-status', 'run-state.json has no string "status"', 'warning', 'status')
    );
  }
  const effectiveRawStatus = rawStatus ?? '';
  const status = rawStatus === undefined ? 'unknown' : normalizeStatus(rawStatus);
  if (rawStatus !== undefined && status === 'unknown') {
    diagnostics.push(
      diag('run-state-unknown-status', `Unrecognized status "${rawStatus}"`, 'warning', 'status')
    );
  }

  const schemaRaw = asNumber(value['schema_version']) ?? asNumber(value['version']);
  const schemaVersion = schemaRaw ?? 0;
  if (schemaRaw !== undefined && !SUPPORTED_SCHEMA_VERSIONS.has(schemaRaw)) {
    diagnostics.push(
      diag(
        'run-state-unsupported-schema-version',
        `Unsupported schema_version ${schemaRaw} (supported: 1, 2). Parsed best-effort.`,
        'warning',
        'schema_version'
      )
    );
  }

  const state: RunState = {
    schemaVersion,
    runId,
    ...(asNonEmptyString(value['label']) ? { label: asNonEmptyString(value['label']) } : {}),
    feature: asString(value['feature']) ?? '',
    status,
    rawStatus: effectiveRawStatus,
    phase: asString(value['phase']) ?? '',
    ...(asNonEmptyString(value['created_at'])
      ? { createdAt: asNonEmptyString(value['created_at']) }
      : {}),
    ...(asNonEmptyString(value['updated_at'])
      ? { updatedAt: asNonEmptyString(value['updated_at']) }
      : {}),
    repository: normalizeRepository(value['repository']),
    ...((): { baseline?: BaselineInfo } => {
      const baseline = normalizeBaseline(value['baseline']);
      return baseline ? { baseline } : {};
    })(),
    maxReviewRounds: clampInt(asNumber(value['max_review_rounds']), 3, 1, 5),
    reviewRound: Math.max(0, Math.trunc(asNumber(value['review_round']) ?? 0)),
    stopGateBlocks: Math.max(0, Math.trunc(asNumber(value['stop_gate_blocks']) ?? 0)),
    artifacts: normalizeArtifacts(value['artifacts']),
    verification: normalizeVerification(value['verification']),
    reviews: normalizeReviewRefs(value['reviews']),
    adversarialReviews: normalizeReviewRefs(value['adversarial_reviews']),
    risk: normalizeRisk(value['risk']),
    notes: asStringArray(value['notes']),
    completionGateFailures: asStringArray(value['completion_gate_failures']),
    raw: value
  };

  return { state, diagnostics };
}

/** Parse run-state.json text (tolerant of JSON errors). */
export function parseRunStateText(text: string): RunStateParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      diagnostics: [diag('run-state-parse-error', `Invalid JSON: ${message}`, 'error')]
    };
  }
  return normalizeRunState(parsed);
}
