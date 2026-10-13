import assert from 'node:assert/strict';
import test from 'node:test';
import { detect, detectDeviceAnomaly, detectDeviceEvents, readDetectionEvents, revocationProposal } from '../src/detect.mjs';

const START = Date.UTC(2026, 9, 1, 0, 0, 0);
const subject = 'learner_fixture';
const deviceId = 'aaaaaaaaaaaaaaaa';

function legacyReads(count, { intervalSeconds = 2, owner = subject, method = 'GET', start = START } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    at: new Date(start + index * intervalSeconds * 1000).toISOString(),
    method, identity: { sub: owner },
  }));
}
function virtualEvents(count, { intervalSeconds = 2, owner = subject, device = deviceId,
  network = 'unusual', method = 'GET', decision = 'allow', start = START } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    at: new Date(start + index * intervalSeconds * 1000).toISOString(),
    subjectId: owner, deviceId: device, method, decision, network,
    source: 'local_virtual_fixture',
  }));
}

test('detect keeps the exact three-field contract and separates subjects and time windows', () => {
  assert.deepEqual(detect(legacyReads(30)), { action: 'observe' });
  assert.deepEqual(detect(legacyReads(120)), { action: 'observe' });
  assert.deepEqual(detect(legacyReads(121)), { action: 'propose_revocation', reasonCode: 'burst_read', subject });
  assert.deepEqual(detect([...legacyReads(100), ...legacyReads(100, { owner: 'other_fixture' })]), { action: 'observe' });
  assert.deepEqual(detect(legacyReads(200, { intervalSeconds: 7 })), { action: 'observe' });
});

test('rejects invalid top-level event collections', () => {
  assert.throws(() => detect({ events: legacyReads(121) }), /invalid_detection_events/u);
  assert.throws(() => readDetectionEvents({ events: virtualEvents(1) }), /invalid_detection_events/u);
});

test('parser accepts only the exact documented seven-field local fixture and excludes secrets', () => {
  const [valid] = virtualEvents(1);
  const input = { ...valid, body: 'private', token: 'private', name: 'private', headers: { authorization: 'private' }, extra: true };
  const before = structuredClone(input);
  const parsed = readDetectionEvents([input]);
  assert.deepEqual(parsed, [valid]);
  assert.deepEqual(Object.keys(parsed[0]).sort(), ['at', 'decision', 'deviceId', 'method', 'network', 'source', 'subjectId']);
  assert.equal(Object.isFrozen(parsed[0]), true);
  assert.deepEqual(input, before);
  assert.deepEqual(readDetectionEvents([
    { ...valid, source: 'engine_verified' },
    { ...valid, network: 'new_network' },
    { ...valid, deviceId: 'virtual-device-a' },
    { ...valid, decision: undefined },
    { ...valid, at: '2026-10-01' },
  ]), []);
});

test('composite anomaly emits a separate target-and-reason proposal only when combined evidence exists', () => {
  const expected = { action: 'propose_revocation', reasonCode: 'burst_read', subject, deviceId };
  assert.deepEqual(detectDeviceAnomaly(virtualEvents(121)), { suspicious: true, reasonCode: 'burst_read', subject, deviceId });
  assert.deepEqual(revocationProposal(virtualEvents(121)), expected);
  assert.deepEqual(detectDeviceEvents(virtualEvents(121)), expected);
  assert.equal(revocationProposal(virtualEvents(120)), null);
  assert.equal(revocationProposal(virtualEvents(121, { network: 'usual' })), null);
});

test('a separate unusual-network non-read event supports the composite but is not counted as a read', () => {
  const reads = virtualEvents(121, { network: 'usual' });
  const signal = {
    at: new Date(START + 1).toISOString(),
    subjectId: subject, deviceId, method: 'POST', decision: 'deny',
    network: 'unusual', source: 'local_virtual_fixture',
  };
  assert.deepEqual(revocationProposal([...reads, signal]), {
    action: 'propose_revocation', reasonCode: 'burst_read', subject, deviceId,
  });
  assert.deepEqual(detectDeviceAnomaly([...virtualEvents(120, { network: 'usual' }), signal]), { suspicious: false });
});

test('normal network, denied reads, writes, mixed devices/users and outside-window events do not qualify', () => {
  assert.equal(revocationProposal(virtualEvents(30)), null);
  assert.equal(revocationProposal(virtualEvents(121, { decision: 'deny' })), null);
  assert.equal(revocationProposal(virtualEvents(121, { method: 'PUT' })), null);
  assert.equal(revocationProposal([
    ...virtualEvents(100, { device: 'aaaaaaaaaaaaaaaa' }),
    ...virtualEvents(100, { device: 'bbbbbbbbbbbbbbbb' }),
  ]), null);
  assert.equal(revocationProposal([
    ...virtualEvents(100, { owner: 'learner_one' }),
    ...virtualEvents(100, { owner: 'learner_two' }),
  ]), null);
  assert.equal(revocationProposal([
    ...virtualEvents(1, { start: START - 600_000 }),
    ...virtualEvents(121, { start: START, network: 'usual' }),
  ]), null);
});

test('proposal is limited to one device and reason code; inputs are not mutated', () => {
  const events = virtualEvents(121).map(event => ({
    ...event, body: 'private', token: 'private', name: 'private', headers: { authorization: 'private' },
  }));
  const before = structuredClone(events);
  const proposal = revocationProposal(events);
  assert.deepEqual(proposal, { action: 'propose_revocation', reasonCode: 'burst_read', subject, deviceId });
  assert.deepEqual(events, before);
  assert.deepEqual(Object.keys(proposal).sort(), ['action', 'deviceId', 'reasonCode', 'subject']);
  assert.equal(proposal.targets, undefined);
  assert.equal(proposal.devices, undefined);
});

test('legacy events without device/network evidence cannot produce a device-targeted composite proposal', () => {
  assert.equal(revocationProposal(legacyReads(121)), null);
});
