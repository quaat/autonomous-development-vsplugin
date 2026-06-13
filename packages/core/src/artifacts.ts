/**
 * Safe resolution of artifact paths recorded in run-state. Artifact references
 * are run-dir-relative or absolute (docs/REFERENCE.md §3). Relative references
 * must not escape the run directory.
 */

import { isAbsolute, relative, resolve } from 'node:path';

export interface ArtifactResolution {
  /** Absolute path on disk, or undefined if the reference is unsafe. */
  readonly path?: string;
  /** Set when resolution was rejected (relative path escaping the run dir). */
  readonly escaped?: boolean;
}

/**
 * Resolve an artifact reference against a run directory.
 * - Absolute references are returned as-is (the user's controller wrote them).
 * - Relative references are resolved under `runDir` and rejected if they escape.
 */
export function resolveArtifactPath(runDir: string, reference: string): ArtifactResolution {
  if (reference.length === 0) {
    return {};
  }
  if (isAbsolute(reference)) {
    return { path: resolve(reference) };
  }
  const runDirAbs = resolve(runDir);
  const candidate = resolve(runDirAbs, reference);
  const rel = relative(runDirAbs, candidate);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    return { path: candidate };
  }
  return { escaped: true };
}

/** Conventional run-dir-relative names used when an artifact key is absent. */
export const CONVENTIONAL_ARTIFACT_NAMES = {
  featureRequest: 'feature-request.md',
  repositoryContext: 'repository-context.txt',
  enhance: 'feature-spec.codex.json',
  acceptedSpec: 'accepted-spec.md',
  plan: 'implementation-plan.codex.json',
  acceptedPlan: 'accepted-plan.md'
} as const;
