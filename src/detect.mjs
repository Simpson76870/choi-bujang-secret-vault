// Stage 9 has two explicit contracts: the original detector and separate composite proposal.
// Never retain or return request bodies, tokens, names, or headers.
const LOCAL_EVENT_SOURCE = 'local_virtual_fixture';
const SUBJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const DEVICE_ID = /^[a-f0-9]{16}$/u;
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
const DECISIONS = new Set(['allow', 'deny', 'step_up']);
const NETWORKS = new Set(['usual', 'unusual']);
const WINDOW_MS = 10 * 60 * 1000;
const READ_LIMIT = 120;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseTime(value) {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : null;
}

function hasBurst(times) {
  times.sort((a, b) => a - b);
  let start = 0;
  for (let end = 0; end < times.length; end += 1) {
    while (times[end] - times[start] >= WINDOW_MS) start += 1;
    if (end - start + 1 > READ_LIMIT) return true;
  }
  return false;
}

/** Original contract: { at, method, identity: { sub } }. */
export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  const readsBySubject = new Map();
  for (const event of events) {
    if (!isPlainObject(event) || event.method !== 'GET'
        || !isPlainObject(event.identity)
        || typeof event.identity.sub !== 'string'
        || !SUBJECT_ID.test(event.identity.sub)) continue;
    const time = parseTime(event.at);
    if (time === null) continue;
    const subject = event.identity.sub;
    if (!readsBySubject.has(subject)) readsBySubject.set(subject, []);
    readsBySubject.get(subject).push(time);
  }
  for (const [subject, times] of readsBySubject) {
    if (hasBurst(times)) return { action: 'propose_revocation', reasonCode: 'burst_read', subject };
  }
  return { action: 'observe' };
}

function readOneDetectionEvent(event) {
  if (!isPlainObject(event)
      || event.source !== LOCAL_EVENT_SOURCE
      || typeof event.at !== 'string'
      || typeof event.subjectId !== 'string' || !SUBJECT_ID.test(event.subjectId)
      || typeof event.deviceId !== 'string' || !DEVICE_ID.test(event.deviceId)
      || !METHODS.has(event.method)
      || !DECISIONS.has(event.decision)
      || !NETWORKS.has(event.network)) return null;
  const time = parseTime(event.at);
  if (time === null) return null;
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

/** Parse only the exact seven-field local virtual-event contract. */
export function readDetectionEvents(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  const parsed = [];
  for (const event of events) {
    const safeEvent = readOneDetectionEvent(event);
    if (safeEvent) parsed.push(safeEvent);
  }
  return parsed;
}

/** Only >120 allowed GETs plus unusual network in the same 10-minute window qualify. */
export function detectDeviceAnomaly(events) {
  const parsed = readDetectionEvents(events);
  const groups = new Map();
  for (const event of parsed) {
    const isAllowedRead = event.method === 'GET' && event.decision === 'allow';
    const isUnusualNetwork = event.network === 'unusual';
    if (!isAllowedRead && !isUnusualNetwork) continue;
    const key = JSON.stringify([event.subjectId, event.deviceId]);
    if (!groups.has(key)) groups.set(key, { subject: event.subjectId, deviceId: event.deviceId, items: [] });
    groups.get(key).items.push({ at: Date.parse(event.at), isAllowedRead, isUnusualNetwork });
  }
  for (const { subject, deviceId, items } of groups.values()) {
    items.sort((a, b) => a.at - b.at);
    let start = 0;
    let readCount = 0;
    let unusualCount = 0;
    for (let end = 0; end < items.length; end += 1) {
      readCount += Number(items[end].isAllowedRead);
      unusualCount += Number(items[end].isUnusualNetwork);
      while (items[end].at - items[start].at >= WINDOW_MS) {
        readCount -= Number(items[start].isAllowedRead);
        unusualCount -= Number(items[start].isUnusualNetwork);
        start += 1;
      }
      if (readCount > READ_LIMIT && unusualCount > 0) {
        return { suspicious: true, reasonCode: 'burst_read', subject, deviceId };
      }
    }
  }
  return { suspicious: false };
}

/** Separate proposal only; no evidence means null. Never calls a revocation API. */
export function revocationProposal(events) {
  const candidate = detectDeviceAnomaly(events);
  if (!candidate.suspicious) return null;
  return Object.freeze({
    action: 'propose_revocation',
    reasonCode: candidate.reasonCode,
    subject: candidate.subject,
    deviceId: candidate.deviceId,
  });
}

export function detectDeviceEvents(events) {
  return revocationProposal(events) ?? { action: 'observe' };
}
