import assert from 'node:assert/strict';
import test from 'node:test';
import { detectDeviceAnomaly, readDetectionEvents } from '../src/detect.mjs';

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

const START = Date.UTC(2026, 9, 1, 0, 0, 0);
function reads(count, overrides = {}) {
  const {
    intervalSeconds = 2,
    subjectId = 'learner_fixture',
    deviceId = 'aaaaaaaaaaaaaaaa',
    method = 'GET',
    decision = 'allow',
    network = 'unusual',
    source = 'local_virtual_fixture',
    start = START,
  } = overrides;
  return Array.from({ length: count }, (_, index) => ({
    at: new Date(start + index * intervalSeconds * 1000).toISOString(),
    subjectId, deviceId, method, decision, network, source,
  }));
}

test('marks a same-device allowed read burst with an unusual network', () => {
  assert.deepEqual(detectDeviceAnomaly(reads(121)), {
    suspicious: true,
    reasonCode: 'burst_read',
    subject: 'learner_fixture',
    deviceId: 'aaaaaaaaaaaaaaaa',
  });
});

test('keeps normal volume and normal network as non-suspicious', () => {
  assert.deepEqual(detectDeviceAnomaly(reads(30)), { suspicious: false });
  assert.deepEqual(detectDeviceAnomaly(reads(120)), { suspicious: false });
  assert.deepEqual(detectDeviceAnomaly(reads(121, { network: 'usual' })), { suspicious: false });
});

test('only allowed GET events count toward the compound pattern', () => {
  assert.deepEqual(detectDeviceAnomaly(reads(121, { method: 'PUT' })), { suspicious: false });
  assert.deepEqual(detectDeviceAnomaly(reads(121, { decision: 'deny' })), { suspicious: false });
  assert.deepEqual(detectDeviceAnomaly(reads(121, { decision: 'step_up' })), { suspicious: false });
});

test('does not combine users, devices, or events outside the rolling ten-minute window', () => {
  assert.deepEqual(detectDeviceAnomaly([
    ...reads(100),
    ...reads(100, { deviceId: 'bbbbbbbbbbbbbbbb' }),
  ]), { suspicious: false });
  assert.deepEqual(detectDeviceAnomaly([
    ...reads(100),
    ...reads(100, { subjectId: 'learner_other' }),
  ]), { suspicious: false });
  assert.deepEqual(detectDeviceAnomaly([
    ...reads(1, { start: START - 600_000, network: 'unusual' }),
    ...reads(121, { start: START, network: 'usual' }),
  ]), { suspicious: false });
});

test('does not mutate input or return content, tokens, names, or header values', () => {
  const input = reads(121).map(event => ({
    ...event,
    body: 'never include',
    token: 'never include',
    name: 'not a real identity',
    headers: { authorization: 'never include' },
  }));
  const before = structuredClone(input);
  const output = detectDeviceAnomaly(input);
  assert.equal(output.suspicious, true);
  assert.equal(Object.hasOwn(output, 'body'), false);
  assert.equal(Object.hasOwn(output, 'token'), false);
  assert.equal(Object.hasOwn(output, 'name'), false);
  assert.deepEqual(input, before);
});
