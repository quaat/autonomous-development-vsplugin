import assert from 'node:assert/strict';
import { normalizeStatus, parseRunStateText } from '../src/runState';

function stateText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema_version: 2,
    run_id: '20260612T201323Z-96954900',
    status: 'active',
    phase: 'implementing',
    feature: 'demo feature',
    repository: { id: '8dd906752e640877', worktree_path: '/repo' },
    max_review_rounds: 3,
    review_round: 1,
    artifacts: { accepted_spec: 'accepted-spec.md', enhance: 'feature-spec.codex.json' },
    verification: {
      passed: false,
      checks: [{ name: 'unit', command: ['npm', 'test'], exit_code: 0 }]
    },
    reviews: [{ round: 1, path: 'review-01.codex.json', verdict: 'pass' }],
    risk: { requires_adversarial_review: true, reasons: ['security-sensitive'] },
    ...overrides
  });
}

describe('parseRunStateText (tolerant, REFERENCE §3)', () => {
  it('parses a well-formed schema_version 2 state', () => {
    const { state, diagnostics } = parseRunStateText(stateText());
    assert.ok(state);
    assert.equal(diagnostics.length, 0);
    assert.equal(state?.runId, '20260612T201323Z-96954900');
    assert.equal(state?.status, 'active');
    assert.equal(state?.schemaVersion, 2);
    assert.equal(state?.artifacts.acceptedSpec, 'accepted-spec.md');
    assert.equal(state?.risk.requiresAdversarialReview, true);
    assert.equal(state?.verification.checks.length, 1);
    assert.equal(state?.reviews[0]?.verdict, 'pass');
  });

  it('returns a parse-error diagnostic and no state on invalid JSON', () => {
    const { state, diagnostics } = parseRunStateText('{ not json');
    assert.equal(state, undefined);
    assert.ok(
      diagnostics.some((d) => d.code === 'run-state-parse-error' && d.severity === 'error')
    );
  });

  it('rejects a non-object payload', () => {
    const { state, diagnostics } = parseRunStateText('[]');
    assert.equal(state, undefined);
    assert.ok(diagnostics.some((d) => d.code === 'run-state-not-object'));
  });

  it('requires a string run_id', () => {
    const { state, diagnostics } = parseRunStateText(JSON.stringify({ status: 'active' }));
    assert.equal(state, undefined);
    assert.ok(diagnostics.some((d) => d.code === 'run-state-missing-run-id'));
  });

  it('tolerates a missing status (warns, normalizes to unknown)', () => {
    const text = JSON.stringify({ run_id: 'r1' });
    const { state, diagnostics } = parseRunStateText(text);
    assert.ok(state);
    assert.equal(state?.status, 'unknown');
    assert.ok(diagnostics.some((d) => d.code === 'run-state-missing-status'));
  });

  it('accepts legacy schema "version": 1', () => {
    const { state, diagnostics } = parseRunStateText(
      JSON.stringify({ version: 1, run_id: 'r1', status: 'active' })
    );
    assert.equal(state?.schemaVersion, 1);
    assert.ok(!diagnostics.some((d) => d.code === 'run-state-unsupported-schema-version'));
  });

  it('warns on an unsupported schema version but still parses', () => {
    const { state, diagnostics } = parseRunStateText(
      JSON.stringify({ schema_version: 99, run_id: 'r1', status: 'active' })
    );
    assert.ok(state);
    assert.ok(diagnostics.some((d) => d.code === 'run-state-unsupported-schema-version'));
  });

  it('warns on an unrecognized status', () => {
    const { state, diagnostics } = parseRunStateText(
      JSON.stringify({ run_id: 'r1', status: 'frobnicating' })
    );
    assert.equal(state?.status, 'unknown');
    assert.equal(state?.rawStatus, 'frobnicating');
    assert.ok(diagnostics.some((d) => d.code === 'run-state-unknown-status'));
  });

  it('clamps max_review_rounds into 1..5 and floors review_round at 0', () => {
    const { state } = parseRunStateText(stateText({ max_review_rounds: 99, review_round: -4 }));
    assert.equal(state?.maxReviewRounds, 5);
    assert.equal(state?.reviewRound, 0);
  });

  it('normalizes a string command to a single-element array', () => {
    const { state } = parseRunStateText(
      stateText({ verification: { checks: [{ name: 'x', command: 'make test', exit_code: 0 }] } })
    );
    assert.deepEqual(state?.verification.checks[0]?.command, ['make test']);
  });

  it('preserves the raw object for forward compatibility', () => {
    const { state } = parseRunStateText(stateText({ futureField: { nested: true } }));
    assert.deepEqual((state?.raw as Record<string, unknown>)['futureField'], { nested: true });
  });

  it('redacts credentials in a remote_display before it enters the model (F-303)', () => {
    const { state } = parseRunStateText(
      stateText({
        repository: {
          id: '8dd906752e640877',
          remote_display: 'https://alice:s3cr3t@github.com/acme/repo.git'
        }
      })
    );
    assert.equal(state?.repository.remoteDisplay, 'https://<redacted>@github.com/acme/repo.git');
  });
});

describe('normalizeStatus', () => {
  it('maps known and aliased statuses', () => {
    assert.equal(normalizeStatus('ACTIVE'), 'active');
    assert.equal(normalizeStatus('completed'), 'complete');
    assert.equal(normalizeStatus('canceled'), 'cancelled');
    assert.equal(normalizeStatus('archived'), 'archived');
    assert.equal(normalizeStatus('blocked'), 'blocked');
  });
  it('maps anything else to unknown', () => {
    assert.equal(normalizeStatus('weird'), 'unknown');
  });
});
