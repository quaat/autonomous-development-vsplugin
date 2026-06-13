/**
 * Stable repository identity (docs/REFERENCE.md §2). Mirrors the reference
 * controller's `_compute_repo_id` exactly so that ids match runs created outside
 * VS Code: the first 16 hex chars of `sha256("<git_common_dir>\n<first_commit>")`.
 *
 * `firstCommit` is the verbatim, stripped output of
 * `git rev-list --max-parents=0 HEAD` — for a repo with multiple root commits it
 * contains several newline-separated hashes, and it is the empty string for a
 * commitless repo. Both inputs must already be resolved (realpath'd) by the
 * caller, exactly as the reference does, before hashing.
 */

import { createHash } from 'node:crypto';

export function computeRepoId(gitCommonDir: string, firstCommit: string): string {
  const key = `${gitCommonDir}\n${firstCommit}`;
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}
