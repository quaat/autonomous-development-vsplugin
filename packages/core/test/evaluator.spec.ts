import assert from 'node:assert/strict';
import { parseRunStateText } from '../src/runState';
import {
  evaluateWorkflow,
  type EvaluatorInput,
  type LatestReviewFacts
} from '../src/workflow/evaluator';
import type { RunState } from '../src/types';

function build(overrides: Record<string, unknown> = {}): RunState {
  const text = JSON.stringify({
    schema_version: 2,
    run_id: 'R1',
    status: 'active',
    phase: 'implementing',
    feature: 'demo',
    repository: { id: 'repo1' },
    max_review_rounds: 3,
    review_round: 0,
    artifacts: { enhance: 'feature-spec.codex.json' },
    verification: { checks: [] },
    reviews: [],
    adversarial_reviews: [],
    risk: { requires_adversarial_review: false, reasons: [] },
    ...overrides
  });
  const { state } = parseRunStateText(text);
  if (!state) {
    throw new Error('fixture state failed to parse');
  }
  return state;
}

function evaluate(state: RunState, extra: Partial<Omit<EvaluatorInput, 'state'>> = {}) {
  return evaluateWorkflow({
    state,
    acceptedSpecExists: extra.acceptedSpecExists ?? false,
    acceptedPlanExists: extra.acceptedPlanExists ?? false,
    ...(extra.latestReview ? { latestReview: extra.latestReview } : {})
  });
}

const passingReview: LatestReviewFacts = { readable: true, verdict: 'pass', severeFindingCount: 0 };

describe('evaluateWorkflow (integration)', () => {
  it('derives a completion-ready run: gates pass, next action is evaluate-report', () => {
    const state = build({
      artifacts: { enhance: 'feature-spec.codex.json' },
      verification: { checks: [{ name: 'unit', command: ['t'], exit_code: 0 }] },
      reviews: [{ round: 1, path: 'review-01.codex.json', verdict: 'pass' }]
    });
    const model = evaluate(state, {
      acceptedSpecExists: true,
      acceptedPlanExists: true,
      latestReview: passingReview
    });
    assert.equal(model.gatesPass, true);
    assert.deepEqual(model.completionGateFailures, []);
    assert.equal(model.recommendedNextAction.code, 'evaluate-report');
    assert.equal(model.verification.passed, true);
    assert.equal(model.review.latestVerdict, 'pass');
  });

  it('parity nuance: verdict==pass + severe findings ⇒ gate fails (severe), next action stays evaluate-report', () => {
    const state = build({
      verification: { checks: [{ name: 'unit', command: ['t'], exit_code: 0 }] },
      reviews: [{ round: 1, path: 'review-01.codex.json', verdict: 'pass' }]
    });
    const model = evaluate(state, {
      acceptedSpecExists: true,
      acceptedPlanExists: true,
      latestReview: { readable: true, verdict: 'pass', severeFindingCount: 2 }
    });
    assert.equal(model.gatesPass, false);
    assert.deepEqual(
      model.completionGateFailures.map((f) => f.code),
      ['severe-findings']
    );
    // stop_gate keys on verdict only ⇒ step 8.
    assert.equal(model.recommendedNextAction.code, 'evaluate-report');
  });

  it('computes review budget (consumed/remaining)', () => {
    const model = evaluate(build({ max_review_rounds: 3, review_round: 2 }));
    assert.deepEqual(model.reviewBudget, { max: 3, consumed: 2, remaining: 1 });
  });

  it('falls back to the run-state cached verdict for next-action when the review file is unreadable', () => {
    const state = build({
      verification: { checks: [{ name: 'unit', command: ['t'], exit_code: 0 }] },
      reviews: [{ round: 1, path: 'review-01.codex.json', verdict: 'pass' }]
    });
    const model = evaluate(state, {
      acceptedSpecExists: true,
      acceptedPlanExists: true,
      latestReview: { readable: false, severeFindingCount: 0 } // file unreadable
    });
    // Gate #6 strictly fails on unreadable...
    assert.ok(model.completionGateFailures.some((f) => f.code === 'review-not-pass'));
    // ...but next-action uses the cached "pass" verdict ⇒ evaluate-report.
    assert.equal(model.recommendedNextAction.code, 'evaluate-report');
  });

  it('marks a blocked run terminal with a blocking reason', () => {
    const model = evaluate(build({ status: 'blocked', phase: 'review-budget-exhausted' }));
    assert.equal(model.isTerminal, true);
    assert.equal(model.blockingReason, 'Review-round budget exhausted');
    assert.equal(model.recommendedNextAction.code, 'blocked');
  });

  it('surfaces required adversarial review state', () => {
    const state = build({
      verification: { checks: [{ name: 'unit', command: ['t'], exit_code: 0 }] },
      reviews: [{ round: 1, path: 'review-01.codex.json', verdict: 'pass' }],
      risk: { requires_adversarial_review: true, reasons: ['security'] }
    });
    const model = evaluate(state, {
      acceptedSpecExists: true,
      acceptedPlanExists: true,
      latestReview: passingReview
    });
    assert.equal(model.adversarial.required, true);
    assert.equal(model.adversarial.satisfied, false);
    assert.equal(model.recommendedNextAction.code, 'adversarial-review');
    assert.ok(model.completionGateFailures.some((f) => f.code === 'adversarial-required'));
  });
});

describe('evaluateWorkflow stage timeline', () => {
  it('marks a freshly-initialized run active at idea-enhanced when enhance is absent', () => {
    const model = evaluate(build({ artifacts: {} }));
    const byId = Object.fromEntries(model.stages.map((s) => [s.id, s.status]));
    assert.equal(byId['initialized'], 'complete');
    assert.equal(byId['idea-enhanced'], 'active');
    assert.equal(byId['final'], 'pending');
  });

  it('skips the adversarial stage when not required', () => {
    const model = evaluate(build());
    const adversarial = model.stages.find((s) => s.id === 'adversarial-review');
    assert.equal(adversarial?.status, 'skipped');
  });

  it('marks verification failed when checks exist but fail', () => {
    const state = build({
      verification: { checks: [{ name: 'unit', command: ['t'], exit_code: 1 }] }
    });
    const model = evaluate(state, { acceptedSpecExists: true, acceptedPlanExists: true });
    const verification = model.stages.find((s) => s.id === 'verification');
    assert.equal(verification?.status, 'failed');
  });

  it('marks every stage complete for a complete run (adversarial skipped if not required)', () => {
    const state = build({
      status: 'complete',
      phase: 'complete',
      verification: { checks: [{ name: 'unit', command: ['t'], exit_code: 0 }] },
      reviews: [{ round: 1, path: 'review-01.codex.json', verdict: 'pass' }]
    });
    const model = evaluate(state, {
      acceptedSpecExists: true,
      acceptedPlanExists: true,
      latestReview: passingReview
    });
    for (const stage of model.stages) {
      if (stage.id === 'adversarial-review') {
        assert.equal(stage.status, 'skipped');
      } else {
        assert.equal(stage.status, 'complete', `${stage.id} should be complete`);
      }
    }
  });

  it('marks the final stage cancelled for a cancelled run', () => {
    const model = evaluate(build({ status: 'cancelled', phase: 'cancelled' }));
    assert.equal(model.stages.find((s) => s.id === 'final')?.status, 'cancelled');
  });
});
