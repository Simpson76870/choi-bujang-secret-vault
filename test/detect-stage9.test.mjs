import assert from 'node:assert/strict';
import test from 'node:test';
import { readDetectionEvents } from '../src/detect.mjs';

const valid = {
  at: '2026-10-01T00:00:00.000Z',
  subjectId: 'learner_fixture',
  deviceId: 'aaaaaaaaaaaaaaaa',
  method: 'GET',
  decision: 'allow',
  network: 'unusual',
  source: 'local_virtual_fixture',
};

test('reads only approved pseudonymous virtual-event fields', () => {
  const input = {
    ...valid,
    body: 'must not escape',
    token: 'must not escape',
    name: 'real-person-name',
    headers: { authorization: 'must not escape' },
    nested: { secret: true },
  };
  const before = structuredClone(input);
  const parsed = readDetectionEvents([input]);
  assert.deepEqual(parsed, [valid]);
  assert.deepEqual(Object.keys(parsed[0]).sort(),
    ['at', 'decision', 'deviceId', 'method', 'network', 'source', 'subjectId']);
  assert.equal(Object.isFrozen(parsed[0]), true);
  assert.deepEqual(input, before, 'the parser must not mutate caller-owned events');
});

test('discards untrusted or malformed virtual events instead of guessing', () => {
  const invalid = [
    { ...valid, source: 'browser' },
    { ...valid, deviceId: 'unknown' },
    { ...valid, subjectId: '' },
    { ...valid, method: 'FETCH' },
    { ...valid, decision: 'maybe' },
    { ...valid, network: 'unknown' },
    { ...valid, at: 'not-a-time' },
    { ...valid, at: '2026-10-01' },
    null,
    'not an event',
  ];
  assert.deepEqual(readDetectionEvents(invalid), []);
});

test('rejects a non-array event collection', () => {
  assert.throws(() => readDetectionEvents({ events: [valid] }), /invalid_detection_events/u);
});
