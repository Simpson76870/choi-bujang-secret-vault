// 판정기는 엔진이 계약에 맞게 검증해 전달한 요청만 사용합니다.
// 브라우저 헤더나 임의 요청 필드를 접속 신호로 승격하지 않습니다.
// judge_fixture는 로컬 가상 시험 전용이며 실제 위치 증거가 아닙니다.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required']);

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
  // Region alone is deliberately not a deny/step-up trigger.
  const unusualHour = signals.hour <= 5 || signals.hour >= 23;
  const unfamiliarNetwork = signals.network !== 'usual';
  const suddenBulkRead = recentEvents.some(event =>
    event.kind === 'risk_signal' && event.ageSeconds <= 300 && event.count >= 10);
  return unusualHour && unfamiliarNetwork && suddenBulkRead;
}

export async function decide(request) {
  if (request?.deviceRegistered !== true) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request?.requestId,
      decision: 'deny',
      reasonCode: 'device_not_registered',
      ruleIds: [RULE_IDS[0]],
    };
  }

  const signals = request?.signals;
  const recentEvents = request?.recentEvents;
  const knownSignalSource = isFixtureSignalSet(signals);
  const knownRecentEvents = isValidRecentEvents(recentEvents);
  const validStepUp = isValidStepUp(request?.stepUp);
  const risk = knownSignalSource && knownRecentEvents && isCompositeRisk(signals, recentEvents);
  // Missing/malformed/unknown-source evidence never becomes an assumed normal request.
  const requiresStepUp = !knownSignalSource || !knownRecentEvents || !validStepUp || risk;
  const reauthenticated = isFreshVerifiedLogin(request?.stepUp);

  if (requiresStepUp && !reauthenticated) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request?.requestId,
      decision: 'step_up',
      reasonCode: 'step_up_required',
      ruleIds: [RULE_IDS[1]],
    };
  }

  return {
    schema: 'aleph.decision.v1',
    requestId: request?.requestId,
    decision: 'allow',
    reasonCode: 'approved',
    ruleIds: requiresStepUp ? [RULE_IDS[0], RULE_IDS[1]] : [RULE_IDS[0]],
  };
}
