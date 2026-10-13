// The legacy three-field exercise remains independent of the richer local fixture.
// Never retain event payloads: project only whitelisted, pseudonymous metadata.
const LOCAL_EVENT_SOURCE = 'local_virtual_fixture';
const SUBJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const DEVICE_ID = /^[a-f0-9]{16}$/u;
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
const DECISIONS = new Set(['allow', 'deny', 'step_up']);
const NETWORKS = new Set(['usual', 'unusual']);

function readOneDetectionEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)
      || event.source !== LOCAL_EVENT_SOURCE
      || typeof event.at !== 'string'
      || typeof event.subjectId !== 'string' || !SUBJECT_ID.test(event.subjectId)
      || typeof event.deviceId !== 'string' || !DEVICE_ID.test(event.deviceId)
      || !METHODS.has(event.method)
      || !DECISIONS.has(event.decision)
      || !NETWORKS.has(event.network)) return null;

  const time = Date.parse(event.at);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== event.at) return null;

  // Do not copy arbitrary keys such as body, token, name, headers, or raw request data.
  return Object.freeze({
    at: event.at,
    subjectId: event.subjectId,
    deviceId: event.deviceId,
    method: event.method,
    decision: event.decision,
    network: event.network,
    source: LOCAL_EVENT_SOURCE,
  });
}

/**
 * Parse only the explicit local virtual-device event contract.
 * Invalid rows are ignored instead of being guessed or repaired.
 */
export function readDetectionEvents(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  const parsed = [];
  for (const event of events) {
    const safeEvent = readOneDetectionEvent(event);
    if (safeEvent) parsed.push(safeEvent);
  }
  return parsed;
}

// The original three-field contract remains unchanged until the composite rule is added.
export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  return { action: 'observe' };
}
