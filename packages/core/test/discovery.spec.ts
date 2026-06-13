import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { discoverRuns, discoverTriageFiles } from '../src/runDiscovery';

function writeRun(stateHome: string, repoId: string, runId: string): void {
  const dir = join(stateHome, 'repositories', repoId, 'runs', runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'run-state.json'),
    JSON.stringify({
      schema_version: 2,
      run_id: runId,
      status: 'active',
      phase: 'initialized',
      feature: 'f',
      repository: { id: repoId }
    })
  );
}

describe('discoverRuns repo scoping (FR-3)', () => {
  let root: string;
  let stateHome: string;

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'autodev-disc-'));
    stateHome = join(root, 'state');
    writeRun(stateHome, 'repoA', 'a1');
    writeRun(stateHome, 'repoB', 'b1');
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  it('enumerates every repository when no repoId is given', () => {
    assert.deepEqual(
      discoverRuns(stateHome)
        .map((r) => r.repoId)
        .sort(),
      ['repoA', 'repoB']
    );
  });

  it('scopes discovery to a single repoId when provided', () => {
    const runs = discoverRuns(stateHome, 'repoA');
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.repoId, 'repoA');
    assert.equal(runs[0]?.runId, 'a1');
  });

  it('returns nothing for an unknown repoId', () => {
    assert.deepEqual(discoverRuns(stateHome, 'does-not-exist'), []);
  });
});

describe('discoverTriageFiles (§9)', () => {
  let root: string;
  let dir: string;

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'autodev-triage-'));
    dir = join(root, 'run');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'triage-02.md'), 'second');
    writeFileSync(join(dir, 'triage-01.md'), 'first');
    writeFileSync(join(dir, 'review-01.codex.json'), '{}');
    writeFileSync(join(dir, 'triage-notes.txt'), 'not a triage round');
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  it('returns only triage-NN.md basenames, sorted', () => {
    assert.deepEqual(discoverTriageFiles(dir), ['triage-01.md', 'triage-02.md']);
  });

  it('returns [] for a missing directory', () => {
    assert.deepEqual(discoverTriageFiles(join(root, 'absent')), []);
  });
});
