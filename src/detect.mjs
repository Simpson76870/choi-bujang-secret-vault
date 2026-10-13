// 9-stage detection uses pseudonymous event metadata only; never retain payloads.
const LOCAL_EVENT_SOURCE = 'local_virtual_fixture';
const ALLOWED_SOURCES = new Set([LOCAL_EVENT_SOURCE, 'judge_fixture', 'engine_verified']);
const SUBJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const DEVICE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
const DECISIONS = new Set(['allow', 'deny', 'step_up']);
const NETWORKS = new Set(['usual', 'unusual']);
const WINDOW_MS = 10 * 60 * 1000;
const READ_LIMIT = 120;

function parseTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = Math.abs(value) < 1e12 ? value * 1000 : value;
    return Number.isFinite(milliseconds) && Math.abs(milliseconds) <= 8.64e15
      ? milliseconds : null;
  }
  if (typeof value !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function normalizeMethod(value) {
  if (typeof value !== 'string') return null;
  const method = value.toUpperCase();
  return METHODS.has(method) ? method : undefined;
}

function normalizeDecision(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 'allow' : 'deny';
  if (typeof value !== 'string') return undefined;
  const decision = value.trim().toLowerCase().replace(/[ -]/gu, '_');
  if (['allow', 'allowed', 'approve', 'approved', 'success', 'ok'].includes(decision)) return 'allow';
  if (['deny', 'denied', 'blocked', 'reject', 'rejected'].includes(decision)) return 'deny';
  if (['step_up', 'challenge', 'challenged', 'require_mfa'].includes(decision)) return 'step_up';
  return undefined;
}

function normalizeNetwork(event) {
  const objectAt = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const signals = objectAt(event.signals);
  const signal = objectAt(event.signal);
  const riskSignals = objectAt(event.riskSignals);
  const networkObject = objectAt(event.network);
  const candidates = [
    typeof event.network === 'string' ? event.network : undefined,
    signals.network, signal.network, riskSignals.network,
    event.networkStatus, event.networkState, event.networkType,
    event.networkClass, signals.networkClass, signal.networkClass,
    networkObject.status, networkObject.type, networkObject.kind,
    signals.network?.status, signals.network?.type,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const value = candidate.trim().toLowerCase().replace(/[ -]/gu, '_');
    if (['usual', 'normal', 'known', 'trusted', 'familiar', 'registered', 'expected', 'same'].includes(value)) {
      return 'usual';
    }
    if ([
      'unusual', 'new', 'different', 'unknown', 'unrecognized', 'untrusted',
      'foreign', 'changed', 'novel', 'other', 'anomalous', 'suspicious',
      'new_network', 'unusual_network', 'network_change', 'network_changed',
      'different_network', 'different_from_usual', 'foreign_network', 'unknown_network',
      'unfamiliar', 'unexpected_network', 'unrecognized_network', 'network_anomaly',
      'roaming', 'public', 'vpn'
    ].includes(value)) return 'unusual';
  }

  const isChanged = event.networkChanged === true
    || signals.networkChanged === true
    || signals.networkAnomaly === true
    || signals.unusualNetwork === true
    || riskSignals.networkChanged === true
    || riskSignals.unusualNetwork === true
    || signal.changed === true
    || [event.kind, event.type, event.signalType].some(value => typeof value === 'string'
      && /(?:unusual|changed|change|anomal|foreign|new|different).*network|network.*(?:unusual|changed|change|anomal|foreign|new|different)/iu.test(value));
  return isChanged ? 'unusual' : null;
}

function readOneDetectionEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;

  const timeValue = event.at ?? event.timestamp ?? event.occurredAt ?? event.time;
  const time = parseTime(timeValue);
  if (time === null) return null;

  const subjectId = event.subjectId ?? event.identity?.sub ?? event.subject?.id
    ?? event.user?.sub ?? event.userId;
  const deviceId = event.deviceId ?? event.device?.id ?? event.device?.deviceId
    ?? event.virtualDevice?.id ?? event.identity?.deviceId ?? event.identity?.device?.id
    ?? event.session?.deviceId ?? event.client?.deviceId;
  const rawMethod = event.method ?? event.request?.method;
  const method = rawMethod === undefined ? null : normalizeMethod(rawMethod);
  const rawDecision = event.decision ?? event.accessDecision ?? event.outcome
    ?? event.result?.decision ?? event.access?.decision;
  const decision = normalizeDecision(rawDecision);
  const network = normalizeNetwork(event);

  const hasDeviceId = deviceId !== undefined && deviceId !== null;
  const validDeviceId = typeof deviceId === 'string' && DEVICE_ID.test(deviceId);
  if (typeof subjectId !== 'string' || !SUBJECT_ID.test(subjectId)
      || (hasDeviceId && !validDeviceId)
      || method === undefined || decision === undefined
      || (method === null && network !== 'unusual')) return null;

  // A read with missing network telemetry is still retained. The network signal
  // may be reported in a separate event; an explicit deny/step-up never counts.
  return Object.freeze({
    at: new Date(time).toISOString(),
    subjectId,
    deviceId: validDeviceId ? deviceId : null,
    method,
    decision,
    network,
    source: ALLOWED_SOURCES.has(event.source) ? event.source : LOCAL_EVENT_SOURCE,
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

  // If a GET log lacks device metadata, associate it only when exactly one
  // validated device for the same pseudonymous subject occurs in its 10-minute
  // neighborhood. Never guess when multiple devices are possible.
  const resolved = parsed.map((event) => {
    if (event.deviceId) return event;
    const at = Date.parse(event.at);
    const nearbyDevices = new Set(parsed
      .filter(other => other.subjectId === event.subjectId
        && typeof other.deviceId === 'string'
        && Math.abs(Date.parse(other.at) - at) < WINDOW_MS)
      .map(other => other.deviceId));
    if (nearbyDevices.size !== 1) return null;
    return { ...event, deviceId: nearbyDevices.values().next().value };
  }).filter(Boolean);

  // Read volume and network anomaly are separate signals. Network-only logs
  // are retained as evidence but never increment the GET counter.
  for (const event of resolved) {
    const isAllowedRead = event.method === 'GET'
      && (event.decision === null || event.decision === 'allow');
    const isUnusualNetwork = event.network === 'unusual';
    if (!isAllowedRead && !isUnusualNetwork) continue;

    const key = JSON.stringify([event.subjectId, event.deviceId]);
    if (!groups.has(key)) {
      groups.set(key, { subject: event.subjectId, deviceId: event.deviceId, items: [] });
    }
    groups.get(key).items.push({
      at: Date.parse(event.at),
      isAllowedRead,
      isUnusualNetwork,
    });
  }

  for (const { subject, deviceId, items } of groups.values()) {
    items.sort((a, b) => a.at - b.at);
    let start = 0;
    let readCount = 0;
    let unusualCount = 0;
    for (let end = 0; end < items.length; end++) {
      readCount += Number(items[end].isAllowedRead);
      unusualCount += Number(items[end].isUnusualNetwork);
      while (items[end].at - items[start].at >= WINDOW_MS) {
        readCount -= Number(items[start].isAllowedRead);
        unusualCount -= Number(items[start].isUnusualNetwork);
        start++;
      }
      if (readCount > READ_LIMIT && unusualCount > 0) {
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
/**
 * Create the separate Stage 9 revocation proposal from composite evidence.
 * A non-suspicious or ambiguous event batch produces no proposal (null).
 * The proposal targets one validated virtual device and contains only the
 * action, reason code, pseudonymous subject, and device identifier.
 * This function does not call a revocation API or change device access.
 */
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

/** Preserve the detector result while exposing the proposal as a separate result. */
export function detectDeviceEvents(events) {
  return revocationProposal(events) ?? { action: 'observe' };
}
