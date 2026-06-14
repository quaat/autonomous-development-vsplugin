import assert from 'node:assert/strict';
import { evaluateGates, gatesPass, type GateFacts } from '../src/workflow/gates';

function passing(overrides: Partial<GateFacts> = {}): GateFacts {
  return {
    acceptedSpecExists: true,
    acceptedPlanExists: true,
    hasChecks: true,
    verificationPassed: true,
    hasReviews: true,
    latestReviewReadable: true,
    latestReviewVerdict: 'pass',
    severeFindingCount: 0,
    requiresAdversarial: false,
    hasAdversarial: false,
    ...overrides
  };
}

function codes(facts: GateFacts): string[] {
  return evaluateGates(facts).map((f) => f.code);
}

describe('evaluateGates (cmd_evaluate parity, REFERENCE §6)', () => {
  it('passes when every condition is satisfied', () => {
    const failures = evaluateGates(passing());
    assert.deepEqual(failures, []);
    assert.equal(gatesPass(failures), true);
  });

  it('#1 fails when accepted-spec is missing', () => {
    assert.deepEqual(codes(passing({ acceptedSpecExists: false })), ['missing-accepted-spec']);
  });

  it('#2 fails when accepted-plan is missing', () => {
    assert.deepEqual(codes(passing({ acceptedPlanExists: false })), ['missing-accepted-plan']);
  });

  it('#3 fails when no verification checks are recorded', () => {
    assert.deepEqual(codes(passing({ hasChecks: false, verificationPassed: false })), [
      'no-verification'
    ]);
  });

  it('#4 fails when a latest-effective check is failing', () => {
    assert.deepEqual(codes(passing({ verificationPassed: false })), ['verification-failing']);
  });

  it('#3 and #4 are mutually exclusive (no checks ⇒ only no-verification)', () => {
    const c = codes(passing({ hasChecks: false, verificationPassed: false }));
    assert.ok(c.includes('no-verification'));
    assert.ok(!c.includes('verification-failing'));
  });

  it('#5 fails when no reviews are recorded', () => {
    assert.deepEqual(codes(passing({ hasReviews: false })), ['no-reviews']);
  });

  it('#6 fails when latest review is unreadable', () => {
    assert.deepEqual(
      codes(passing({ latestReviewReadable: false, latestReviewVerdict: undefined })),
      ['review-not-pass']
    );
  });

  it('#6 fails when latest review verdict is not pass', () => {
    assert.deepEqual(codes(passing({ latestReviewVerdict: 'changes_required' })), [
      'review-not-pass'
    ]);
  });

  it('#7 fails on raw severe findings even when verdict is pass (no triage consulted)', () => {
    // A pass verdict + severe findings also trips the pass+blocking contradiction
    // (controller.py ~2548: `if verdict == "pass" and (severe or blocking_ac)`),
    // even on the review-file fallback path.
    assert.deepEqual(codes(passing({ severeFindingCount: 2 })), [
      'severe-findings',
      'review-inconsistent-pass'
    ]);
  });

  it('#6 and #7 can both fire for a non-pass review with severe findings', () => {
    const c = codes(passing({ latestReviewVerdict: 'changes_required', severeFindingCount: 1 }));
    assert.deepEqual(c, ['review-not-pass', 'severe-findings']);
  });

  it('#8 fails when adversarial is required but missing', () => {
    assert.deepEqual(codes(passing({ requiresAdversarial: true, hasAdversarial: false })), [
      'adversarial-required'
    ]);
  });

  it('#8 fails when adversarial is required but latest verdict is not pass', () => {
    assert.deepEqual(
      codes(
        passing({
          requiresAdversarial: true,
          hasAdversarial: true,
          latestAdversarialVerdict: 'changes_required'
        })
      ),
      ['adversarial-required']
    );
  });

  it('#8 passes when adversarial is required and its latest verdict is pass', () => {
    assert.deepEqual(
      codes(
        passing({
          requiresAdversarial: true,
          hasAdversarial: true,
          latestAdversarialVerdict: 'pass'
        })
      ),
      []
    );
  });

  it('#7 uses the cumulative ledger count when hasCumulativeFindings is set', () => {
    const c = codes(
      passing({
        latestReviewVerdict: 'changes_required',
        hasCumulativeFindings: true,
        cumulativeSevereFindingCount: 3,
        severeFindingCount: 0 // review-file count ignored when the ledger is present
      })
    );
    assert.deepEqual(c, ['review-not-pass', 'severe-findings']);
  });

  it('#7 cumulative message names findings via the supplied description', () => {
    const failures = evaluateGates(
      passing({
        latestReviewVerdict: 'changes_required',
        hasCumulativeFindings: true,
        cumulativeSevereFindingCount: 1,
        severeFindingsDescription: 'F-1 [critical/security] boom'
      })
    );
    const severe = failures.find((f) => f.code === 'severe-findings');
    assert.equal(
      severe?.message,
      '1 unresolved critical/high finding(s) in review ledger: F-1 [critical/security] boom'
    );
  });

  it('#8 acceptance-criteria-unsatisfied fires when a cumulative AC is not satisfied', () => {
    const failures = evaluateGates(
      passing({
        blockingAcceptanceCriteriaCount: 2,
        blockingAcceptanceCriteriaDescription: 'AC-1 [not_satisfied]; AC-2 [partially_satisfied]'
      })
    );
    const ac = failures.find((f) => f.code === 'acceptance-criteria-unsatisfied');
    assert.equal(
      ac?.message,
      '2 acceptance criteria not satisfied: AC-1 [not_satisfied]; AC-2 [partially_satisfied]'
    );
    // A pass verdict + blocking AC also trips the contradiction gate.
    assert.ok(failures.some((f) => f.code === 'review-inconsistent-pass'));
  });

  it('#9 pass verdict + cumulative severe finding ⇒ severe-findings AND review-inconsistent-pass', () => {
    const c = codes(
      passing({
        latestReviewVerdict: 'pass',
        hasCumulativeFindings: true,
        cumulativeSevereFindingCount: 1
      })
    );
    assert.deepEqual(c, ['severe-findings', 'review-inconsistent-pass']);
  });

  it('#9 pass verdict + not_satisfied AC ⇒ acceptance-criteria-unsatisfied AND review-inconsistent-pass', () => {
    const c = codes(passing({ latestReviewVerdict: 'pass', blockingAcceptanceCriteriaCount: 1 }));
    assert.deepEqual(c, ['acceptance-criteria-unsatisfied', 'review-inconsistent-pass']);
  });

  it('#9 contradiction message reports both blocking counts', () => {
    const failures = evaluateGates(
      passing({
        latestReviewVerdict: 'pass',
        hasCumulativeFindings: true,
        cumulativeSevereFindingCount: 2,
        blockingAcceptanceCriteriaCount: 1
      })
    );
    const contradiction = failures.find((f) => f.code === 'review-inconsistent-pass');
    assert.equal(
      contradiction?.message,
      "Latest review verdict is 'pass' but 2 blocking finding(s) and 1 unsatisfied " +
        'acceptance criteria remain (inconsistent review)'
    );
  });

  it('clean cumulative ledger + satisfied AC + pass ⇒ gate passes', () => {
    assert.deepEqual(
      codes(
        passing({
          latestReviewVerdict: 'pass',
          hasCumulativeFindings: true,
          cumulativeSevereFindingCount: 0,
          blockingAcceptanceCriteriaCount: 0
        })
      ),
      []
    );
  });

  it('reports failures in the documented order', () => {
    const c = codes(
      passing({
        acceptedSpecExists: false,
        acceptedPlanExists: false,
        hasChecks: true,
        verificationPassed: false,
        hasReviews: true,
        latestReviewVerdict: 'changes_required',
        severeFindingCount: 1,
        requiresAdversarial: true,
        hasAdversarial: false
      })
    );
    assert.deepEqual(c, [
      'missing-accepted-spec',
      'missing-accepted-plan',
      'verification-failing',
      'review-not-pass',
      'severe-findings',
      'adversarial-required'
    ]);
  });

  it('reports the full ordered set including AC + contradiction (cumulative path)', () => {
    // pass verdict so the contradiction gate is reachable after severe + AC.
    const c = codes(
      passing({
        latestReviewVerdict: 'pass',
        hasCumulativeFindings: true,
        cumulativeSevereFindingCount: 1,
        blockingAcceptanceCriteriaCount: 1,
        requiresAdversarial: true,
        hasAdversarial: false
      })
    );
    assert.deepEqual(c, [
      'severe-findings',
      'acceptance-criteria-unsatisfied',
      'review-inconsistent-pass',
      'adversarial-required'
    ]);
  });
});
