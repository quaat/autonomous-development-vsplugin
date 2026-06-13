import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { summarizeCodexArtifact, summarizeCodexArtifactValue } from '../src/codexArtifact';

describe('summarizeCodexArtifactValue (F-301)', () => {
  it('summarizes an enhanced feature spec in section order', () => {
    const sections = summarizeCodexArtifactValue({
      problem_statement: 'Users cannot do the thing.',
      functional_requirements: ['Render', 'Persist'],
      acceptance_criteria: [{ id: 'AC-1', criterion: 'It renders' }],
      assumptions: ['a1'],
      open_questions: [],
      risks: ['risky'],
      non_goals: ['not this']
    });
    assert.deepEqual(
      sections.map((s) => s.label),
      [
        'Problem statement',
        'Functional requirements',
        'Acceptance criteria',
        'Assumptions',
        'Risks',
        'Non-goals'
      ]
    );
    const fr = sections.find((s) => s.label === 'Functional requirements');
    assert.deepEqual(fr?.items, ['Render', 'Persist']);
    const ac = sections.find((s) => s.label === 'Acceptance criteria');
    assert.deepEqual(ac?.items, ['id: AC-1; criterion: It renders']);
  });

  it('summarizes a proposed plan including object-valued test strategy', () => {
    const sections = summarizeCodexArtifactValue({
      summary: 'Do it.',
      implementation_steps: ['Step one'],
      files_expected_to_change: ['src/app.ts'],
      test_strategy: { unit: 'cover it', integration: 'open dashboard' },
      rollback_strategy: ['Revert']
    });
    const labels = sections.map((s) => s.label);
    assert.deepEqual(labels, [
      'Summary',
      'Implementation steps',
      'Expected files',
      'Test strategy',
      'Rollback strategy'
    ]);
    const test = sections.find((s) => s.label === 'Test strategy');
    assert.deepEqual(test?.items, ['unit: cover it', 'integration: open dashboard']);
  });

  it('accepts camelCase aliases', () => {
    const sections = summarizeCodexArtifactValue({
      functionalRequirements: ['R1'],
      openQuestions: ['Q1']
    });
    assert.deepEqual(
      sections.map((s) => s.label),
      ['Functional requirements', 'Open questions']
    );
  });

  it('omits empty sections and ignores blank strings', () => {
    const sections = summarizeCodexArtifactValue({
      assumptions: [],
      risks: ['  ', ''],
      non_goals: ['real']
    });
    assert.deepEqual(
      sections.map((s) => s.label),
      ['Non-goals']
    );
  });

  it('returns [] for a non-object value', () => {
    assert.deepEqual(summarizeCodexArtifactValue('nope'), []);
    assert.deepEqual(summarizeCodexArtifactValue(null), []);
    assert.deepEqual(summarizeCodexArtifactValue([1, 2]), []);
  });
});

describe('summarizeCodexArtifact (tolerant file read)', () => {
  let dir: string;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'codex-artifact-'));
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads and summarizes a JSON file', () => {
    const path = join(dir, 'spec.json');
    writeFileSync(path, JSON.stringify({ assumptions: ['a1'] }));
    assert.deepEqual(summarizeCodexArtifact(path), [{ label: 'Assumptions', items: ['a1'] }]);
  });

  it('returns [] for a missing file', () => {
    assert.deepEqual(summarizeCodexArtifact(join(dir, 'nope.json')), []);
  });

  it('returns [] for malformed JSON (never throws)', () => {
    const path = join(dir, 'bad.json');
    writeFileSync(path, '{ not json');
    assert.deepEqual(summarizeCodexArtifact(path), []);
  });
});
