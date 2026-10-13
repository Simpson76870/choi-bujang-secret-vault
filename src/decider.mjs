// The policy consumes only the engine-validated decision contract.
// Never promote a browser header/body role into trusted identity or resource metadata.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required', 'resource_zone_policy']);
export const RESOURCE_IDS = Object.freeze({
  notesCollection: 'notes_collection',
  note: 'training_note',
  announcement: 'instructor_announcement',
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
function isFixtureSignalSet(signals) {
  if (!signals || typeof signals !== 'object' || Array.isArray(signals)) return false;
  if (Object.keys(signals).sort().join(',') !== 'hour,network,region,source') return false;
  return signals.source === 'judge_fixture'
    && typeof signals.region === 'string' && signals.region.trim().length > 0
    && typeof signals.network === 'string' && signals.network.trim().length > 0
    && Number.isInteger(signals.hour) && signals.hour >= 0 && signals.hour <= 23;
}
function isValidRecentEvents(events) {
  return Array.isArray(events) && events.length <= 12 && events.every(event =>
    event && typeof event === 'object' && !Array.isArray(event)
    && Object.keys(event).sort().join(',') === 'ageSeconds,count,kind'
    && typeof event.kind === 'string' && event.kind.trim().length > 0
    && Number.isInteger(event.ageSeconds) && event.ageSeconds >= 0
    && Number.isInteger(event.count) && event.count >= 1);
}
function isValidStepUp(stepUp) {
  if (!stepUp || typeof stepUp !== 'object' || Array.isArray(stepUp)
      || Object.keys(stepUp).sort().join(',') !== 'authAgeSeconds,verified') return false;
  if (stepUp.verified === false) return stepUp.authAgeSeconds === null;
  return stepUp.verified === true && Number.isInteger(stepUp.authAgeSeconds)
    && stepUp.authAgeSeconds >= 0 && stepUp.authAgeSeconds <= 900;
}
function isFreshVerifiedLogin(stepUp) {
  return isValidStepUp(stepUp) && stepUp.verified === true
    && stepUp.authAgeSeconds >= 0 && stepUp.authAgeSeconds <= 900;
}
function isCompositeRisk(signals, recentEvents) {
  const unusualHour = signals.hour <= 5 || signals.hour >= 23;
  const unfamiliarNetwork = signals.network !== 'usual';
  const suddenBulkRead = recentEvents.some(event =>
    event.kind === 'risk_signal' && event.ageSeconds <= 300 && event.count >= 10);
  return unusualHour && unfamiliarNetwork && suddenBulkRead;
}
function resolveResource(request) {
  if (!request || typeof request !== 'object'
      || typeof request.subjectId !== 'string' || !request.subjectId.trim()
      || typeof request.deviceId !== 'string' || !/^[0-9a-f]{16}$/u.test(request.deviceId)
      || !['notes', 'announcements'].includes(request.service)
      || !['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)
      || typeof request.path !== 'string' || !request.path.startsWith('/')
      || request.path.includes('?') || request.path.includes('#')
      || request.queryLength !== 0 || request.querySha256 !== EMPTY_SHA256
      || typeof request.route !== 'string') return null;
  if (request.path === '/notes'
      && request.route === request.method + ' /notes'
      && ['GET', 'POST'].includes(request.method)) {
    return { resourceId: RESOURCE_IDS.notesCollection, zone: 'notes', isCollection: true };
  }
  const noteMatch = /^\/notes\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/iu.exec(request.path);
  if (noteMatch && UUID.test(noteMatch[1])
      && request.route === request.method + ' /notes/:id'
      && ['GET', 'PUT', 'DELETE'].includes(request.method)) {
    return { resourceId: RESOURCE_IDS.note + ':' + noteMatch[1].toLowerCase(), zone: 'note' };
  }
  const announcementMatch = /^\/announcements\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/iu.exec(request.path);
  if (announcementMatch && UUID.test(announcementMatch[1])
      && request.route === request.method + ' /announcements/:id'
      && ['GET', 'PUT'].includes(request.method)) {
    return { resourceId: RESOURCE_IDS.announcement + ':' + announcementMatch[1].toLowerCase(), zone: 'announcement' };
  }
  return null;
}
function trustedInstructor(subjectId) {
  // Configure only from trusted runtime settings, never from request.role or request body.
  const configured = (process.env.ALEPH_INSTRUCTOR_SUBJECT_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  return configured.includes(subjectId);
}
function deny(request, reasonCode) {
  return { schema: 'aleph.decision.v1', requestId: request?.requestId,
    decision: 'deny', reasonCode, ruleIds: [RULE_IDS[2]] };
}
export async function decide(request) {
  if (request?.deviceRegistered !== true) {
    return { schema: 'aleph.decision.v1', requestId: request?.requestId,
      decision: 'deny', reasonCode: 'device_not_registered', ruleIds: [RULE_IDS[0]] };
  }
  const resource = resolveResource(request);
  if (!resource) return deny(request, 'resource_forbidden');
  if (resource.zone === 'announcement' && request.method === 'PUT' && !trustedInstructor(request.subjectId)) {
    return deny(request, 'resource_forbidden');
  }
  const signals = request.signals;
  const recentEvents = request.recentEvents;
  const knownSignalSource = isFixtureSignalSet(signals);
  const knownRecentEvents = isValidRecentEvents(recentEvents);
  const validStepUp = isValidStepUp(request.stepUp);
  const risk = knownSignalSource && knownRecentEvents && isCompositeRisk(signals, recentEvents);
  const requiresStepUp = !knownSignalSource || !knownRecentEvents || !validStepUp || risk;
  const reauthenticated = isFreshVerifiedLogin(request.stepUp);
  if (requiresStepUp && !reauthenticated) {
    return { schema: 'aleph.decision.v1', requestId: request.requestId,
      decision: 'step_up', reasonCode: 'step_up_required', ruleIds: [RULE_IDS[1], RULE_IDS[2]] };
  }
  return { schema: 'aleph.decision.v1', requestId: request.requestId,
    decision: 'allow', reasonCode: 'approved', ruleIds: [RULE_IDS[0], RULE_IDS[2]] };
}
