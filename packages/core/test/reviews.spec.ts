import assert from 'node:assert/strict';

import { latestReviewRef, normalizeReviewDocument } from '../src/workflow/reviews';
import { RECOGNIZED_DISPOSITIONS, type ReviewRef } from '../src/types';

describe('normalizeReviewDocument metadata', () => {
  it('parses verification_gaps and acceptance_criteria_assessment (§8)', () => {
    const doc = normalizeReviewDocument({
      verdict: 'changes_required',
      summary: 's',
      confidence: 0.5,
      findings: [],
      verification_gaps: ['no retry-path coverage', 'no fuzzing'],
      acceptance_criteria_assessment: [
        { id: 'AC-1', status: 'satisfied', evidence: 'covered' },
        { id: 'AC-2', status: 'not_satisfied', evidence: 'missing' }
      ]
    });
    assert.deepEqual(doc.verificationGaps, ['no retry-path coverage', 'no fuzzing']);
    assert.equal(doc.acceptanceCriteriaAssessment.length, 2);
    assert.deepEqual(doc.acceptanceCriteriaAssessment[1], {
      id: 'AC-2',
      status: 'not_satisfied',
      evidence: 'missing'
    });
  });

  it('drops non-string gaps and non-object assessments tolerantly', () => {
    const doc = normalizeReviewDocument({
      findings: [],
      verification_gaps: ['ok', 7, null],
      acceptance_criteria_assessment: ['bad', { id: 'AC-1' }, 3]
    });
    assert.deepEqual(doc.verificationGaps, ['ok']);
    assert.deepEqual(doc.acceptanceCriteriaAssessment, [{ id: 'AC-1' }]);
  });

  it('defaults metadata arrays when fields are absent or wrong-typed', () => {
    const doc = normalizeReviewDocument({
      verification_gaps: 'nope',
      acceptance_criteria_assessment: 42
    });
    assert.deepEqual(doc.verificationGaps, []);
    assert.deepEqual(doc.acceptanceCriteriaAssessment, []);
  });

  it('returns empty arrays (not undefined) for a non-object input', () => {
    const doc = normalizeReviewDocument(null);
    assert.deepEqual(doc.findings, []);
    assert.deepEqual(doc.verificationGaps, []);
    assert.deepEqual(doc.acceptanceCriteriaAssessment, []);
  });
});

describe('latestReviewRef (controller.py reviews[-1] parity)', () => {
  it('returns undefined for an empty list', () => {
    assert.equal(latestReviewRef([]), undefined);
  });

  it('returns the array tail, matching the controller, not the max round', () => {
    // The controller uses reviews[-1] in both cmd_evaluate and
    // compute_next_action. A later-appended review with a *lower* round must
    // still win, so the gate reads the same review the controller does.
    const reviews: ReviewRef[] = [
      { round: 3, path: 'r3.json' },
      { round: 1, path: 'r1-late.json' }
    ];
    assert.equal(latestReviewRef(reviews)?.path, 'r1-late.json');
  });
});

describe('RECOGNIZED_DISPOSITIONS', () => {
  it('is exactly the five documented dispositions in order (§9)', () => {
    assert.deepEqual(
      [...RECOGNIZED_DISPOSITIONS],
      [
        'accepted',
        'rejected_with_evidence',
        'already_resolved',
        'out_of_scope_but_recorded',
        'requires_human_decision'
      ]
    );
  });
});
