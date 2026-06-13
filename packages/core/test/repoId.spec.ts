import assert from 'node:assert/strict';

import { computeRepoId } from '../src/repoId';

describe('computeRepoId', () => {
  it('matches the reference sha256("<common_dir>\\n<first_commit>")[:16] vector', () => {
    // Cross-validated against the reference controller's hashlib output.
    assert.equal(computeRepoId('/srv/repo/.git', 'abc123'), '77e64d77c922d133');
  });

  it('is deterministic and order-sensitive', () => {
    const id = computeRepoId('/x/.git', 'c1');
    assert.equal(id, computeRepoId('/x/.git', 'c1'));
    assert.notEqual(id, computeRepoId('c1', '/x/.git'));
  });

  it('treats multi-root first-commit output verbatim (newline-joined)', () => {
    assert.notEqual(computeRepoId('/x/.git', 'c1'), computeRepoId('/x/.git', 'c1\nc2'));
  });

  it('hashes an empty first commit (commitless repo) without throwing', () => {
    assert.match(computeRepoId('/x/.git', ''), /^[0-9a-f]{16}$/);
  });
});
