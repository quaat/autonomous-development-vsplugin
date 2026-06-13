/**
 * IO layer: read a run directory from disk, assemble the file-read facts the
 * pure evaluator needs, and produce a {@link WorkflowModel}. All reads are
 * tolerant — a malformed file yields diagnostics, never a throw.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { CONVENTIONAL_ARTIFACT_NAMES, resolveArtifactPath } from './artifacts';
import { diag, type Diagnostic } from './diagnostics';
import { parseRunStateText, type RunStateParseResult } from './runState';
import type { RunState } from './types';
import { evaluateWorkflow, type LatestReviewFacts, type WorkflowModel } from './workflow/evaluator';
import { countSevereFindings, latestReviewRef, parseReviewText } from './workflow/reviews';

export const RUN_STATE_FILENAME = 'run-state.json';
export const EVENT_LOG_FILENAME = 'events.jsonl';

export interface LoadedRun {
  readonly runDir: string;
  readonly state?: RunState;
  readonly model?: WorkflowModel;
  readonly diagnostics: readonly Diagnostic[];
}

function safeReadFile(path: string): { text?: string; error?: string } {
  try {
    return { text: readFileSync(path, 'utf8') };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function fileExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Existence of an artifact, preferring the recorded ref, else the conventional name. */
function artifactExists(runDir: string, ref: string | undefined, conventional: string): boolean {
  if (ref) {
    const resolved = resolveArtifactPath(runDir, ref);
    if (resolved.path) {
      return fileExists(resolved.path);
    }
  }
  return fileExists(join(runDir, conventional));
}

function readLatestReviewFacts(
  runDir: string,
  state: RunState,
  diagnostics: Diagnostic[]
): LatestReviewFacts | undefined {
  if (state.reviews.length === 0) {
    return undefined;
  }
  const ref = latestReviewRef(state.reviews) ?? state.reviews[state.reviews.length - 1];
  const refPath = ref?.path ?? state.artifacts.review;
  if (!refPath) {
    diagnostics.push(
      diag('review-unreadable', 'Latest review has no file path recorded', 'warning')
    );
    return { readable: false, severeFindingCount: 0 };
  }
  const resolved = resolveArtifactPath(runDir, refPath);
  if (!resolved.path) {
    diagnostics.push(
      diag(
        'artifact-path-escapes-run-dir',
        `Review path escapes run dir: ${refPath}`,
        'warning',
        refPath
      )
    );
    return { readable: false, severeFindingCount: 0 };
  }
  const { text, error } = safeReadFile(resolved.path);
  if (text === undefined) {
    diagnostics.push(
      diag('review-unreadable', `Could not read latest review: ${error}`, 'warning', resolved.path)
    );
    return { readable: false, severeFindingCount: 0 };
  }
  const { document, diagnostics: reviewDiags } = parseReviewText(text, resolved.path);
  diagnostics.push(...reviewDiags);
  if (!document) {
    return { readable: false, severeFindingCount: 0 };
  }
  return {
    readable: true,
    ...(document.verdict !== undefined ? { verdict: document.verdict } : {}),
    severeFindingCount: countSevereFindings(document)
  };
}

/** Build a {@link WorkflowModel} from an already-parsed run state + run dir. */
export function buildModel(
  runDir: string,
  state: RunState,
  diagnostics: Diagnostic[]
): WorkflowModel {
  const acceptedSpecExists = artifactExists(
    runDir,
    state.artifacts.acceptedSpec,
    CONVENTIONAL_ARTIFACT_NAMES.acceptedSpec
  );
  const acceptedPlanExists = artifactExists(
    runDir,
    state.artifacts.acceptedPlan,
    CONVENTIONAL_ARTIFACT_NAMES.acceptedPlan
  );
  const latestReview = readLatestReviewFacts(runDir, state, diagnostics);

  return evaluateWorkflow({
    state,
    acceptedSpecExists,
    acceptedPlanExists,
    ...(latestReview !== undefined ? { latestReview } : {})
  });
}

/** Parse run-state text and evaluate it against a run dir (no run-state IO). */
export function evaluateRunStateText(runDir: string, text: string): LoadedRun {
  const parsed: RunStateParseResult = parseRunStateText(text);
  const diagnostics: Diagnostic[] = [...parsed.diagnostics];
  if (!parsed.state) {
    return { runDir, diagnostics };
  }
  const model = buildModel(runDir, parsed.state, diagnostics);
  return { runDir, state: parsed.state, model, diagnostics };
}

/** Read + evaluate a run directory from disk. */
export function loadRun(runDir: string): LoadedRun {
  const statePath = join(runDir, RUN_STATE_FILENAME);
  if (!existsSync(statePath)) {
    return {
      runDir,
      diagnostics: [
        diag('run-state-unreadable', `No ${RUN_STATE_FILENAME} in ${runDir}`, 'error', statePath)
      ]
    };
  }
  const { text, error } = safeReadFile(statePath);
  if (text === undefined) {
    return {
      runDir,
      diagnostics: [
        diag('run-state-unreadable', `Could not read run-state.json: ${error}`, 'error', statePath)
      ]
    };
  }
  return evaluateRunStateText(runDir, text);
}
