import assert from 'node:assert/strict';
import { parseEventLog, reconstructTimeline } from '../src/index';

function line(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    schemaVersion: 1,
    sequence: 1,
    timestamp: '2026-06-12T20:13:23Z',
    runId: 'run-1',
    repositoryId: 'repo-1',
    phase: 'implementing',
    source: 'controller',
    type: 'phase.started',
    payload: {},
    ...overrides
  });
}

describe('parseEventLog', () => {
  it('parses a clean multi-line log', () => {
    const content =
      [
        line({ sequence: 1, type: 'run.created' }),
        line({ sequence: 2, type: 'phase.started' }),
        line({ sequence: 3, type: 'phase.completed' })
      ].join('\n') + '\n';
    const result = parseEventLog(content);
    assert.equal(result.events.length, 3);
    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.truncatedTail, false);
    assert.deepEqual(
      result.events.map((e) => e.sequence),
      [1, 2, 3]
    );
  });

  it('tolerates a truncated final line (no trailing newline)', () => {
    const content =
      line({ sequence: 1 }) + '\n' + line({ sequence: 2 }) + '\n' + '{"schemaVersion":1,"sequen';
    const result = parseEventLog(content);
    assert.equal(result.events.length, 2);
    assert.equal(result.truncatedTail, true);
    assert.ok(result.diagnostics.some((d) => d.code === 'truncated-tail'));
  });

  it('treats a JSON-broken interior line as a non-fatal parse error', () => {
    const content =
      line({ sequence: 1 }) + '\n' + 'not json at all' + '\n' + line({ sequence: 2 }) + '\n';
    const result = parseEventLog(content);
    assert.equal(result.events.length, 2);
    assert.ok(result.diagnostics.some((d) => d.code === 'parse-error' && d.line === 2));
    assert.equal(result.truncatedTail, false);
  });

  it('preserves objects with a non-current schemaVersion', () => {
    const future = JSON.stringify({ schemaVersion: 2, sequence: 5, somethingNew: true });
    const content = line({ sequence: 1 }) + '\n' + future + '\n';
    const result = parseEventLog(content);
    assert.equal(result.events.length, 1);
    assert.equal(result.preserved.length, 1);
    assert.equal(result.preserved[0]?.raw['schemaVersion'], 2);
    assert.ok(result.diagnostics.some((d) => d.code === 'future-schema-version'));
  });

  it('preserves a valid object that fails v1 envelope validation', () => {
    const bad = JSON.stringify({ schemaVersion: 1, sequence: -3, type: 'x' });
    const content = bad + '\n';
    const result = parseEventLog(content);
    assert.equal(result.events.length, 0);
    assert.equal(result.preserved.length, 1);
    assert.ok(result.diagnostics.some((d) => d.code === 'invalid-envelope'));
  });

  it('accepts an unknown event type as a valid event', () => {
    const content = line({ sequence: 1, type: 'totally.new.event' }) + '\n';
    const result = parseEventLog(content);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0]?.type, 'totally.new.event');
  });

  it('de-duplicates repeated sequence numbers (first wins)', () => {
    const content =
      line({ sequence: 1, type: 'phase.started' }) +
      '\n' +
      line({ sequence: 1, type: 'phase.started' }) +
      '\n';
    const result = parseEventLog(content);
    assert.equal(result.events.length, 1);
    assert.ok(result.diagnostics.some((d) => d.code === 'duplicate-sequence'));
  });

  it('flags a non-monotonic sequence but retains the event', () => {
    const content = line({ sequence: 5 }) + '\n' + line({ sequence: 3 }) + '\n';
    const result = parseEventLog(content);
    assert.equal(result.events.length, 2);
    assert.ok(
      result.diagnostics.some((d) => d.code === 'sequence-nonmonotonic' && d.sequence === 3)
    );
  });

  it('bounds in-memory retention to the most recent entries', () => {
    const lines: string[] = [];
    for (let i = 1; i <= 10; i++) {
      lines.push(line({ sequence: i }));
    }
    const result = parseEventLog(lines.join('\n') + '\n', { maxEntries: 4 });
    assert.equal(result.events.length, 4);
    assert.deepEqual(
      result.events.map((e) => e.sequence),
      [7, 8, 9, 10]
    );
    assert.ok(result.diagnostics.some((d) => d.code === 'retention-truncated'));
  });

  it('handles an empty log without error', () => {
    const result = parseEventLog('');
    assert.equal(result.events.length, 0);
    assert.equal(result.totalLines, 0);
    assert.equal(result.truncatedTail, false);
  });

  it('ignores blank lines', () => {
    const content = line({ sequence: 1 }) + '\n\n\n' + line({ sequence: 2 }) + '\n';
    const result = parseEventLog(content);
    assert.equal(result.events.length, 2);
  });
});

describe('reconstructTimeline', () => {
  it('orders by sequence and derives summaries', () => {
    const content = [
      line({ sequence: 2, type: 'phase.started', payload: { phase: 'verifying' } }),
      line({ sequence: 1, type: 'run.created', payload: { label: 'demo' } }),
      line({
        sequence: 3,
        type: 'verification.completed',
        payload: { name: 'unit', exitCode: 0 }
      })
    ].join('\n');
    const { events } = parseEventLog(content);
    const timeline = reconstructTimeline(events);
    assert.deepEqual(
      timeline.map((t) => t.sequence),
      [1, 2, 3]
    );
    assert.equal(timeline[0]?.summary, 'Run created (demo)');
    assert.equal(timeline[1]?.summary, 'Phase started: verifying');
    assert.equal(timeline[2]?.summary, 'Verification unit passed');
  });

  it('falls back to the event type for unknown types', () => {
    const content = line({ sequence: 1, type: 'mystery.kind' });
    const { events } = parseEventLog(content);
    const timeline = reconstructTimeline(events);
    assert.equal(timeline[0]?.summary, 'mystery.kind');
  });
});
