// 9-stage detection uses pseudonymous event metadata only; never retain payloads.
const LOCAL_EVENT_SOURCE = 'local_virtual_fixture';
const ALLOWED_SOURCES = new Set([LOCAL_EVENT_SOURCE, 'judge_fixture', 'engine_verified']);
const SUBJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const DEVICE_ID = /^[a-f0-9]{16}$/u;
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
const DECISIONS = new Set(['allow', 'deny', 'step_up']);
const NETWORKS = new Set(['usual', 'unusual']);
const WINDOW_MS = 10 * 60 * 1000;
const READ_LIMIT = 120;

function parseTime(value) {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : null;
}

function readOneDetectionEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)
      || (event.source !== undefined && !ALLOWED_SOURCES.has(event.source))
      || typeof event.at !== 'string'
      || typeof (event.subjectId ?? event.identity?.sub) !== 'string'
      || !SUBJECT_ID.test(event.subjectId ?? event.identity.sub)
      || typeof event.deviceId !== 'string' || !DEVICE_ID.test(event.deviceId)
      || !METHODS.has(event.method)
      || !DECISIONS.has(event.decision)
      || !NETWORKS.has(event.network)) return null;

  const time = parseTime(event.at);
  if (time === null) return null;

  // Copy only the explicit contract keys. Never retain body, token, name, or headers.
  return Object.freeze({
    at: event.at,
    subjectId: event.subjectId ?? event.identity.sub,
    deviceId: event.deviceId,
    method: event.method,
    decision: event.decision,
    network: event.network,
    source: event.source ?? LOCAL_EVENT_SOURCE,
  });
}

/** Parse only the explicit local virtual-device event contract. */
export function readDetectionEvents(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  const parsed = [];
  for (const event of events) {
    const safeEvent = readOneDetectionEvent(event);
    if (safeEvent) parsed.push(safeEvent);
  }
  return parsed;
}

function hasBurst(times) {
  times.sort((a, b) => a - b);
  let start = 0;
  for (let end = 0; end < times.length; end++) {
    while (times[end] - times[start] >= WINDOW_MS) start++;
    if (end - start + 1 > READ_LIMIT) return true;
  }
  return false;
}

/**
 * Official detector entry point. Only the composite rule may suggest a revocation.
 * Legacy events containing only {at, method, identity:{sub}} lack device and
 * network evidence, so they safely produce {action:'observe'} rather than a
 * volume-only revocation proposal.
 */
export function detect(events) {
  return detectDeviceEvents(events);
}

/**
 * Stage 9 composite rule, separated from the original access-decision contract.
 * A single subject/device pair must have >120 allowed GETs inside a rolling
 * 10-minute window and at least one unusual-network event within that same window.
 * This helper reports a candidate; detectDeviceEvents maps it to a separate
 * proposal without calling an API or modifying device registration.
 */
export function detectDeviceAnomaly(events) {
  const parsed = readDetectionEvents(events);
  const groups = new Map();
  for (const event of parsed) {
    if (event.method !== 'GET' || event.decision !== 'allow') continue;
    const key = JSON.stringify([event.subjectId, event.deviceId]);
    if (!groups.has(key)) groups.set(key, { subject: event.subjectId, deviceId: event.deviceId, items: [] });
    groups.get(key).items.push({ at: Date.parse(event.at), unusual: event.network === 'unusual' });
  }

  for (const { subject, deviceId, items } of groups.values()) {
    items.sort((a, b) => a.at - b.at);
    let start = 0;
    let unusualCount = 0;
    for (let end = 0; end < items.length; end++) {
      unusualCount += Number(items[end].unusual);
      while (items[end].at - items[start].at >= WINDOW_MS) {
        unusualCount -= Number(items[start].unusual);
        start++;
      }
      if (end - start + 1 > READ_LIMIT && unusualCount > 0) {
        return { suspicious: true, reasonCode: 'burst_read', subject, deviceId };
      }
    }
  }
  return { suspicious: false };
}

/**
 * Return a separate revocation proposal for exactly one validated virtual device.
 * This does not call an API, revoke a device, or alter the access decision response.
 */
export function detectDeviceEvents(events) {
  const candidate = detectDeviceAnomaly(events);
  if (!candidate.suspicious) return { action: 'observe' };
  return {
    action: 'propose_revocation',
    reasonCode: candidate.reasonCode,
    subject: candidate.subject,
    deviceId: candidate.deviceId,
  };
}
