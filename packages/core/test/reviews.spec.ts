import assert from 'node:assert/strict';

import { normalizeReviewDocument } from '../src/workflow/reviews';
import { RECOGNIZED_DISPOSITIONS } from '../src/types';

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
