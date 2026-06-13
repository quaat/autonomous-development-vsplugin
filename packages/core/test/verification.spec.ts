import assert from 'node:assert/strict';
import { summarizeVerification } from '../src/workflow/verification';
import type { VerificationCheck } from '../src/types';

function check(name: string, exitCode?: number): VerificationCheck {
  return exitCode === undefined
    ? { name, command: ['run', name] }
    : { name, command: ['run', name], exitCode };
}

describe('summarizeVerification (latest-effective rule, REFERENCE §5)', () => {
  it('reports no checks for an empty list', () => {
    const s = summarizeVerification([]);
    assert.equal(s.hasChecks, false);
    assert.equal(s.passed, false);
    assert.equal(s.total, 0);
  });

  it('passes when the single check exits 0', () => {
    const s = summarizeVerification([check('unit', 0)]);
    assert.equal(s.passed, true);
    assert.equal(s.passedCount, 1);
    assert.equal(s.failedCount, 0);
  });

  it('fails when any latest-effective check is non-zero', () => {
    const s = summarizeVerification([check('unit', 0), check('lint', 1)]);
    assert.equal(s.passed, false);
    assert.equal(s.failedCount, 1);
  });

  it('uses the LAST entry per name as effective (a later pass overrides an earlier fail)', () => {
    const s = summarizeVerification([check('unit', 1), check('unit', 0)]);
    assert.equal(s.total, 1, 'one distinct logical check');
    assert.equal(s.passed, true);
    assert.equal(s.latest[0]?.exitCode, 0);
    assert.equal(s.attemptsByName['unit']?.length, 2, 'both attempts retained for inspection');
  });

  it('a later fail overrides an earlier pass', () => {
    const s = summarizeVerification([check('unit', 0), check('unit', 1)]);
    assert.equal(s.passed, false);
    assert.equal(s.latest[0]?.exitCode, 1);
  });

  it('preserves first-seen order of distinct names', () => {
    const s = summarizeVerification([check('b', 0), check('a', 0), check('b', 0)]);
    assert.deepEqual(
      s.latest.map((c) => c.name),
      ['b', 'a']
    );
  });

  it('treats a missing exit code (in-flight) as non-passing', () => {
    const s = summarizeVerification([check('unit')]);
    assert.equal(s.passed, false);
    assert.equal(s.failedCount, 1);
  });
});
