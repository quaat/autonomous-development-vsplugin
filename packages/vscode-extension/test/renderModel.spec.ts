import assert from 'node:assert/strict';

import { discoverRuns, loadEventLog, type DiscoveredRun } from '@semanticmatter/core';

import { toDashboardView } from '../src/dashboard/renderModel';
import { buildFixtures, type Fixtures } from './fixtures';

let fixtures: Fixtures;
let runs: DiscoveredRun[];

function find(runId: string): DiscoveredRun {
  const run = runs.find((r) => r.runId === runId);
  assert.ok(run, `run ${runId} not discovered`);
  return run;
}

function viewFor(runId: string): ReturnType<typeof toDashboardView> {
  const run = find(runId);
  return toDashboardView(run, loadEventLog(run.runDir));
}

before(() => {
  fixtures = buildFixtures();
  runs = discoverRuns(fixtures.stateHome);
});

after(() => {
  fixtures?.cleanup();
});

describe('toDashboardView', () => {
  it('serializes a complete run with derived gates, artifacts, and timeline', () => {
    const view = viewFor('complete');
    assert.equal(view.status, 'complete');
    assert.equal(view.gatesPass, true);
    assert.equal(view.nextAction.code, 'none');

    assert.equal(view.artifacts.length, 5);
    assert.ok(
      view.artifacts.every((a) => a.exists),
      'all five chain artifacts should exist'
    );

    assert.equal(view.verification.total, 1);
    assert.equal(view.verification.passedCount, 1);
    assert.equal(view.verification.checks[0]?.command, 'npm test');
    assert.equal(view.verification.checks[0]?.passed, true);

    // Reconstructed from events.jsonl (run.created, verification.completed).
    assert.equal(view.timeline.length, 2);
    assert.equal(view.timeline[0]?.type, 'run.created');
  });

  it('attaches semantic summaries to the enhanced spec and proposed plan artifacts (F-301)', () => {
    const view = viewFor('complete');
    const enhance = view.artifacts.find((a) => a.command === 'autonomousDev.openEnhancedSpec');
    const enhanceLabels = (enhance?.sections ?? []).map((s) => s.label);
    assert.deepEqual(enhanceLabels, [
      'Problem statement',
      'Functional requirements',
      'Acceptance criteria',
      'Assumptions',
      'Risks',
      'Non-goals'
    ]);

    const plan = view.artifacts.find((a) => a.command === 'autonomousDev.openProposedPlan');
    const planLabels = (plan?.sections ?? []).map((s) => s.label);
    assert.deepEqual(planLabels, [
      'Summary',
      'Implementation steps',
      'Expected files',
      'Test strategy',
      'Rollback strategy',
      'Risks',
      'Non-goals'
    ]);

    // Markdown artifacts carry no structured summary.
    const acceptedSpec = view.artifacts.find((a) => a.command === 'autonomousDev.openAcceptedSpec');
    assert.equal(acceptedSpec?.sections, undefined);
  });

  it('exposes a review finding with file + 1-based line for editor navigation', () => {
    const view = viewFor('changesRequired');
    const round = view.review.rounds[0];
    assert.ok(round, 'expected one review round');
    assert.equal(round.readable, true);
    const finding = round.findings[0];
    assert.equal(finding?.file, 'src/app.ts');
    assert.equal(finding?.line, 42);
    assert.equal(finding?.severity, 'high');
    assert.equal(round.findingCountsBySeverity['high'], 1);
  });

  it('surfaces review metadata: verification gaps and acceptance-criteria assessment (F-101)', () => {
    const view = viewFor('changesRequired');
    const round = view.review.rounds[0];
    assert.ok(round, 'expected one review round');
    assert.deepEqual(round.verificationGaps, ['No integration test covers the retry path.']);
    assert.equal(round.acceptanceCriteria.length, 1);
    assert.deepEqual(round.acceptanceCriteria[0], {
      id: 'AC-1',
      status: 'partially_satisfied',
      evidence: 'Happy path covered; error path unverified.'
    });
  });

  it('surfaces legacy triage markdown read-only without fabricating dispositions (F-101)', () => {
    const view = viewFor('changesRequired');
    assert.deepEqual(view.review.triageFiles, [{ filename: 'triage-01.md' }]);
  });

  it('attaches a structured disposition from a triaged event to its finding (F-201)', () => {
    const view = viewFor('changesRequired');
    const finding = view.review.rounds[0]?.findings[0];
    assert.equal(finding?.id, 'F-1');
    assert.equal(finding?.disposition, 'accepted');
  });

  it('does not flag a disagreement when the event log matches run-state (F-203)', () => {
    const view = viewFor('changesRequired');
    assert.ok(!view.diagnostics.some((d) => d.code === 'event-log-disagreement'));
  });

  it('merges precise event-log diagnostics into the dashboard (F-102)', () => {
    const view = viewFor('changesRequired');
    const parseError = view.diagnostics.find((d) => d.code === 'parse-error');
    assert.ok(parseError, 'expected a parse-error diagnostic from the malformed interior line');
    assert.match(parseError.message, /events\.jsonl \(line 2\)/);
    assert.equal(parseError.severity, 'warning');
  });

  it('marks the adversarial requirement as required and unsatisfied', () => {
    const view = viewFor('adversarialRequired');
    assert.equal(view.adversarial.required, true);
    assert.equal(view.adversarial.satisfied, false);
    assert.deepEqual(view.adversarial.reasons, ['Touches authentication']);
  });

  it('returns a diagnostics-only shell for a malformed run', () => {
    const view = viewFor('malformed');
    assert.equal(view.status, 'unknown');
    assert.deepEqual(view.stages, []);
    assert.ok(view.diagnostics.some((d) => d.code === 'run-state-parse-error'));
  });
});
