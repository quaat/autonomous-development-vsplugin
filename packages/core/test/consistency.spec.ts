import assert from 'node:assert/strict';

import { detectEventLogDisagreements, findingDispositionsFromEvents } from '../src/consistency';
import type { RunEvent } from '@semanticmatter/protocol';

function ev(overrides: Partial<RunEvent>): RunEvent {
  return {
    schemaVersion: 1,
    sequence: 1,
    timestamp: '2026-06-12T10:00:00Z',
    runId: 'r1',
    repositoryId: 'repoA',
    phase: 'review',
    source: 'controller',
    type: 'review.started',
    payload: {},
    ...overrides
  };
}

describe('detectEventLogDisagreements (accepted-plan NFR)', () => {
  it('is silent when every event matches the run-state identity', () => {
    const out = detectEventLogDisagreements({ runId: 'r1', repositoryId: 'repoA' }, [
      ev({}),
      ev({ sequence: 2, type: 'review.completed' })
    ]);
    assert.deepEqual(out, []);
  });

  it('flags a foreign runId as one non-fatal warning', () => {
    const out = detectEventLogDisagreements({ runId: 'r1', repositoryId: 'repoA' }, [
      ev({ runId: 'OTHER' })
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.code, 'event-log-disagreement');
    assert.equal(out[0]?.severity, 'warning');
    assert.match(out[0]?.message ?? '', /OTHER/);
  });

  it('flags a foreign repositoryId distinctly from runId', () => {
    const out = detectEventLogDisagreements({ runId: 'r1', repositoryId: 'repoA' }, [
      ev({ runId: 'OTHER', repositoryId: 'repoZ' })
    ]);
    assert.equal(out.length, 2);
    assert.ok(out.every((d) => d.code === 'event-log-disagreement'));
  });

  it('collapses repeated foreign ids into a single diagnostic', () => {
    const out = detectEventLogDisagreements({ runId: 'r1', repositoryId: 'repoA' }, [
      ev({ runId: 'X' }),
      ev({ runId: 'X', sequence: 2 })
    ]);
    assert.equal(out.length, 1);
  });

  it('returns [] when the expected identity is unknown (nothing to compare)', () => {
    assert.deepEqual(detectEventLogDisagreements({ runId: '', repositoryId: '' }, [ev({})]), []);
  });

  describe('status progression (F-302)', () => {
    function statusChanged(status: unknown, sequence = 1): RunEvent {
      return ev({ sequence, type: 'run.status.changed', payload: { status } });
    }

    it('flags the latest event status disagreeing with run-state status', () => {
      const out = detectEventLogDisagreements(
        { runId: 'r1', repositoryId: 'repoA', status: 'blocked' },
        [statusChanged('active', 1)]
      );
      assert.equal(out.length, 1);
      assert.equal(out[0]?.code, 'event-log-disagreement');
      assert.equal(out[0]?.severity, 'warning');
      assert.match(out[0]?.message ?? '', /status active.*run-state status is blocked/);
    });

    it('uses the latest run.status.changed when several are present', () => {
      const out = detectEventLogDisagreements(
        { runId: 'r1', repositoryId: 'repoA', status: 'complete' },
        [statusChanged('active', 1), statusChanged('complete', 2)]
      );
      assert.deepEqual(out, []);
    });

    it('is silent when the event status matches run-state', () => {
      const out = detectEventLogDisagreements(
        { runId: 'r1', repositoryId: 'repoA', status: 'active' },
        [statusChanged('active', 1)]
      );
      assert.deepEqual(out, []);
    });

    it('is silent when the log asserts no status', () => {
      const out = detectEventLogDisagreements(
        { runId: 'r1', repositoryId: 'repoA', status: 'active' },
        [ev({ type: 'review.started' })]
      );
      assert.deepEqual(out, []);
    });

    it('does not compare status when expected.status is omitted', () => {
      const out = detectEventLogDisagreements({ runId: 'r1', repositoryId: 'repoA' }, [
        statusChanged('blocked', 1)
      ]);
      assert.deepEqual(out, []);
    });
  });
});

describe('findingDispositionsFromEvents (§9, "shown when present")', () => {
  function triaged(findingId: unknown, disposition: unknown, sequence = 1): RunEvent {
    return ev({ sequence, type: 'review.finding.triaged', payload: { findingId, disposition } });
  }

  it('maps a recognized disposition from a triaged event', () => {
    const map = findingDispositionsFromEvents([triaged('F-1', 'accepted')]);
    assert.equal(map.get('F-1'), 'accepted');
  });

  it('ignores unrecognized dispositions (forward-compatible)', () => {
    const map = findingDispositionsFromEvents([triaged('F-1', 'totally_made_up')]);
    assert.equal(map.has('F-1'), false);
  });

  it('lets the latest triage win for a finding', () => {
    const map = findingDispositionsFromEvents([
      triaged('F-1', 'requires_human_decision', 1),
      triaged('F-1', 'already_resolved', 2)
    ]);
    assert.equal(map.get('F-1'), 'already_resolved');
  });

  it('skips non-triaged events and malformed payloads', () => {
    const map = findingDispositionsFromEvents([
      ev({ type: 'review.completed', payload: { findingId: 'F-9', disposition: 'accepted' } }),
      triaged(7, 'accepted'),
      triaged('F-2', 42)
    ]);
    assert.equal(map.size, 0);
  });
});
