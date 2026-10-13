// Use only the engine-verified contract and explicitly provisioned resources.
const starterResources = Object.freeze([
  Object.freeze({
    classId: 'class_fixture',
    projectId: 'project_fixture',
    subjectId: 'learner_fixture',
    ownerSubjectId: 'learner_fixture',
    deviceId: 'aaaaaaaaaaaaaaaa',
    service: 'notes',
    path: '/notes/demo',
    resourceId: 'notes:demo',
    permissions: Object.freeze(['GET', 'PUT']),
  }),
]);
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const RESOURCE_SCOPE_RULE = 'resource_scope';
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required', RESOURCE_SCOPE_RULE]);

export function resourceAllowed(request, bindings = starterResources) {
  if (!request || typeof request !== 'object'
      || request.schema !== 'aleph.decision.v1'
      || !['classId', 'projectId', 'subjectId'].every(key =>
        typeof request[key] === 'string' && request[key].length > 0 && request[key].length <= 256)
      || !/^[a-f0-9]{16}$/u.test(request.deviceId ?? '')
      || request.queryLength !== 0 || request.querySha256 !== EMPTY_SHA256
      || !['GET', 'PUT'].includes(request.method)
      || typeof request.path !== 'string'
      || !request.path.startsWith('/')
      || /[%?#\\]/u.test(request.path)
      || typeof request.route !== 'string'
      || typeof request.service !== 'string') return false;

  const family = request.service === 'notes' ? 'notes'
    : request.service === 'notices' ? 'notices'
    : request.service === 'announcements' ? 'announcements'
    : null;
  if (!family) return false;

  const segments = request.path.slice(1).split('/');
  if (segments.length < 1 || segments.length > 2 || segments.some(segment => !segment)) return false;
  if (segments[0] !== family) return false;
  const isCollection = segments.length === 1;
  const resourcePart = isCollection ? 'own-list' : segments[1];
  if (!isCollection && resourcePart !== 'demo'
      && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(resourcePart)) return false;
  const expectedRoute = request.method + ' /' + family + (isCollection ? '' : '/:id');
  if (request.route !== expectedRoute || (isCollection && request.method !== 'GET')) return false;

  const resourceId = family + ':' + resourcePart;
  return bindings.some(entry =>
    entry.classId === request.classId
    && entry.projectId === request.projectId
    && entry.subjectId === request.subjectId
    && entry.deviceId === request.deviceId
    && entry.service === request.service
    && entry.path === request.path
    && entry.resourceId === resourceId
    && Array.isArray(entry.permissions)
    && entry.permissions.includes(request.method)
    && (family !== 'notes' || entry.ownerSubjectId === request.subjectId)
    && (family !== 'notices' || request.method !== 'PUT' || entry.instructor === true)
    && (family !== 'announcements' || request.method !== 'PUT' || entry.instructor === true)
  );
}

function response(request, decision, reasonCode, ruleId) {
  return { schema: 'aleph.decision.v1', requestId: request?.requestId,
    decision, reasonCode, ruleIds: [ruleId] };
}
function assessSignals(signals) {
  if (!signals || typeof signals !== 'object' || Array.isArray(signals)) return null;
  const fixture = signals.source === 'judge_fixture'
    && ['local', 'foreign'].includes(signals.region)
    && ['usual', 'unusual'].includes(signals.network)
    && Number.isInteger(signals.hour) && signals.hour >= 0 && signals.hour <= 23;
  const unavailable = signals.source === 'none'
    && signals.region === 'unknown' && signals.network === 'unknown';
  return fixture ? 'fixture' : unavailable ? 'unavailable' : null;
}
function validRecentEvents(events) {
  return Array.isArray(events) && events.length <= 12 && events.every(event =>
    event && typeof event === 'object' && !Array.isArray(event)
    && typeof event.kind === 'string'
    && Number.isInteger(event.count) && event.count >= 0
    && Number.isFinite(event.ageSeconds) && event.ageSeconds >= 0);
}
export async function decide(request) {
  if (!request || request.deviceRegistered !== true) {
    return response(request, 'deny', 'device_not_registered', 'device_registered');
  }
  const signalState = assessSignals(request.signals);
  const events = request.recentEvents;
  if (!signalState || !validRecentEvents(events)) {
    return response(request, 'step_up', 'step_up_required', 'step_up_required');
  }
  const volume = events.some(event => event.kind === 'risk_signal'
    && event.ageSeconds <= 300 && event.count >= 10);
  const riskCount = signalState === 'fixture'
    ? Number(request.signals.region === 'foreign')
      + Number(request.signals.network === 'unusual')
      + Number(request.signals.hour < 6 || request.signals.hour >= 23)
      + Number(volume)
    : 0;
  const verified = request.stepUp?.verified === true
    && Number.isInteger(request.stepUp.authAgeSeconds)
    && request.stepUp.authAgeSeconds >= 0 && request.stepUp.authAgeSeconds <= 900;
  if (riskCount >= 2 && !verified) {
    return response(request, 'step_up', 'step_up_required', 'step_up_required');
  }
  if (resourceAllowed(request)) return response(request, 'allow', 'approved', RESOURCE_SCOPE_RULE);
  return response(request, 'deny', 'resource_not_allowed', RESOURCE_SCOPE_RULE);
}
