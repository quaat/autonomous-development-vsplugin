import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validateRunEvent,
  isKnownEventType,
  KNOWN_EVENT_TYPES,
  RUN_EVENT_SCHEMA_VERSION,
  RUN_EVENT_ENVELOPE_KEYS
} from '../src/index';

function baseEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    sequence: 1,
    timestamp: '2026-06-12T20:13:23Z',
    runId: '20260612T201323Z-96954900',
    repositoryId: '8dd906752e640877',
    phase: 'implementing',
    source: 'controller',
    type: 'run.created',
    payload: { label: 'demo' },
    ...overrides
  };
}

describe('validateRunEvent', () => {
  it('accepts a well-formed v1 envelope', () => {
    const result = validateRunEvent(baseEvent());
    assert.equal(result.valid, true);
    assert.ok(result.event);
    assert.equal(result.event?.runId, '20260612T201323Z-96954900');
    assert.equal(result.event?.type, 'run.created');
  });

  it('accepts an unknown event type (forward compatibility)', () => {
    const result = validateRunEvent(baseEvent({ type: 'future.event.kind' }));
    assert.equal(result.valid, true);
    assert.equal(result.event?.type, 'future.event.kind');
  });

  it('captures unknown extra envelope fields into event.extra', () => {
    const result = validateRunEvent(baseEvent({ futureField: 42, another: 'x' }));
    assert.equal(result.valid, true);
    assert.deepEqual(result.event?.extra, { futureField: 42, another: 'x' });
  });

  it('does not set extra when there are no unknown fields', () => {
    const result = validateRunEvent(baseEvent());
    assert.equal(result.event?.extra, undefined);
  });

  it('preserves an optional correlationId', () => {
    const result = validateRunEvent(baseEvent({ correlationId: 'abc' }));
    assert.equal(result.event?.correlationId, 'abc');
  });

  it('rejects a non-object', () => {
    assert.equal(validateRunEvent(42).valid, false);
    assert.equal(validateRunEvent(null).valid, false);
    assert.equal(validateRunEvent([1, 2]).valid, false);
  });

  it('rejects a wrong schemaVersion', () => {
    const result = validateRunEvent(baseEvent({ schemaVersion: 2 }));
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.path === 'schemaVersion'));
  });

  it('rejects a non-integer or negative sequence', () => {
    assert.equal(validateRunEvent(baseEvent({ sequence: 1.5 })).valid, false);
    assert.equal(validateRunEvent(baseEvent({ sequence: -1 })).valid, false);
    assert.equal(validateRunEvent(baseEvent({ sequence: 'x' })).valid, false);
  });

  it('requires the core string fields', () => {
    for (const field of ['timestamp', 'runId', 'repositoryId', 'source', 'type']) {
      assert.equal(validateRunEvent(baseEvent({ [field]: '' })).valid, false, `${field} empty`);
      assert.equal(validateRunEvent(baseEvent({ [field]: 5 })).valid, false, `${field} number`);
    }
  });

  it('allows an empty phase but requires it to be a string', () => {
    assert.equal(validateRunEvent(baseEvent({ phase: '' })).valid, true);
    assert.equal(validateRunEvent(baseEvent({ phase: 3 })).valid, false);
  });

  it('requires payload to be present but allows null', () => {
    assert.equal(validateRunEvent(baseEvent({ payload: null })).valid, true);
    const noPayload = baseEvent();
    delete noPayload['payload'];
    assert.equal(validateRunEvent(noPayload).valid, false);
  });
});

describe('event type catalogue', () => {
  it('recognizes all known types', () => {
    for (const type of KNOWN_EVENT_TYPES) {
      assert.equal(isKnownEventType(type), true, type);
    }
  });

  it('does not recognize an unknown type', () => {
    assert.equal(isKnownEventType('nope.not.real'), false);
  });

  it('includes the documented lifecycle events', () => {
    for (const type of [
      'run.created',
      'phase.started',
      'verification.completed',
      'review.finding.triaged',
      'gate.changed',
      'approval.resolved'
    ]) {
      assert.ok(KNOWN_EVENT_TYPES.includes(type as never), type);
    }
  });
});

describe('run-event.schema.json resource', () => {
  const schemaPath = resolve(__dirname, '../../../..', 'resources/schemas/run-event.schema.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;

  it('pins schemaVersion to the current protocol version', () => {
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    assert.equal(props['schemaVersion']?.['const'], RUN_EVENT_SCHEMA_VERSION);
  });

  it('requires every envelope key except the optional correlationId', () => {
    const required = schema['required'] as string[];
    for (const key of RUN_EVENT_ENVELOPE_KEYS) {
      if (key === 'correlationId') {
        continue;
      }
      assert.ok(required.includes(key), `schema requires ${key}`);
    }
  });

  it('keeps type open (no enum) and allows additional properties for forward compat', () => {
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    assert.equal(props['type']?.['enum'], undefined);
    assert.equal(schema['additionalProperties'], true);
  });
});
