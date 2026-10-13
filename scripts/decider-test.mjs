import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureRequests } from './fixture-7.mjs';

const RESPONSE_KEYS = 'decision,reasonCode,requestId,ruleIds,schema';
function validResponse(request, response, ruleIds) {
  return response && typeof response === 'object' && !Array.isArray(response)
    && Object.keys(response).sort().join(',') === RESPONSE_KEYS
    && response.schema === 'aleph.decision.v1' && response.requestId === request.requestId
    && ['allow', 'deny', 'step_up'].includes(response.decision)
    && typeof response.reasonCode === 'string' && /^[a-z][a-z0-9_]{0,63}$/u.test(response.reasonCode)
    && Array.isArray(response.ruleIds) && response.ruleIds.length > 0
    && response.ruleIds.every(id => ruleIds.includes(id));
}
export async function checkDecider({ decide, ruleIds }) {
  if (typeof decide !== 'function' || !Array.isArray(ruleIds)
      || !['device_registered','step_up_required','resource_zone_policy'].every(id => ruleIds.includes(id))) {
    throw new Error('8단계 resource_zone_policy 규칙을 RULE_IDS에 구현해 주세요.');
  }
  const { normal, suspicious } = fixtureRequests();
  const uid = randomUUID();
  const announcementPath = '/announcements/20000000-0000-4000-8000-000000000099';
  const checks = [
    { name: '등록 기기의 정상 메모 요청', request: normal, decision: 'allow' },
    { name: '미등록 기기의 가상 요청', request: { ...normal, requestId: randomUUID(), deviceRegistered: false }, decision: 'deny', reasonCode: 'device_not_registered' },
    { name: '등록 상태가 없는 요청', request: (() => { const r={...normal,requestId:randomUUID()}; delete r.deviceRegistered; return r; })(), decision: 'deny', reasonCode: 'device_not_registered' },
    { name: '복합 이상 접속은 추가 확인', request: suspicious, decision: 'step_up', reasonCode: 'step_up_required' },
    { name: '새 로그인 확인 후 복합 사건 재판정', request: { ...suspicious, requestId: randomUUID(), stepUp: { verified: true, authAgeSeconds: 60 } }, decision: 'allow' },
    { name: '클라이언트 헤더 출처는 신뢰하지 않음', request: { ...normal, requestId: randomUUID(), signals: { ...normal.signals, source: 'client_header' } }, decision: 'step_up', reasonCode: 'step_up_required' },
    { name: '지역만 다른 정상 조합은 허용', request: { ...normal, requestId: randomUUID(), signals: { ...normal.signals, region: 'foreign' } }, decision: 'allow' },
    { name: '엔진 신호 없음 상태의 정상 메모 요청', request: { ...normal, requestId: randomUUID(), signals: { source: 'none', region: 'unknown', network: 'unknown', hour: normal.signals.hour } }, decision: 'allow' },
    { name: '공개 API 접두 경로의 메모 요청', request: { ...normal, requestId: randomUUID(), path: '/api/notes/10000000-0000-4000-8000-000000000099' }, decision: 'allow' },
    { name: '메모 자원 GET', request: { ...normal, requestId: randomUUID() }, decision: 'allow' },
    { name: '메모 자원 PUT', request: { ...normal, requestId: randomUUID(), method: 'PUT', route: 'PUT /notes/:id' }, decision: 'allow' },
    { name: '일반 학생의 강사 공지 수정은 거부', request: { ...normal, requestId: randomUUID(), path: announcementPath, route: 'PUT /announcements/:id', method: 'PUT' }, decision: 'deny', reasonCode: 'resource_forbidden' },
    { name: '신뢰 설정의 강사는 공지 수정 가능', request: { ...normal, requestId: randomUUID(), subjectId: 'teacher_fixture', path: announcementPath, route: 'PUT /announcements/:id', method: 'PUT', service: 'announcements' }, decision: 'allow' },
    { name: '기능 경로 export는 거부', request: { ...normal, requestId: randomUUID(), path: '/notes/export', route: 'GET /notes/:id' }, decision: 'deny', reasonCode: 'resource_forbidden' },
    { name: '쿼리로 자원 지정하는 요청은 거부', request: { ...normal, requestId: randomUUID(), queryLength: 4 }, decision: 'deny', reasonCode: 'resource_forbidden' },
  ];
  const results = [];
  for (const item of checks) {
    const response = await decide(item.request);
    const passed = validResponse(item.request, response, ruleIds)
      && response.decision === item.decision
      && (!item.reasonCode || response.reasonCode === item.reasonCode);
    results.push({ name: item.name, passed });
  }
  return results;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const previous = process.env.ALEPH_INSTRUCTOR_SUBJECT_IDS;
  try {
    // A fixture-only allowlist simulates trusted operator configuration, not a request-body role.
    process.env.ALEPH_INSTRUCTOR_SUBJECT_IDS = 'teacher_fixture';
    const { decide, RULE_IDS } = await import('../src/decider.mjs');
    const results = await checkDecider({ decide, ruleIds: RULE_IDS });
    for (const item of results) process.stdout.write((item.passed ? '통과' : '확인 필요') + ' · ' + item.name + '\n');
    process.stdout.write('이 명령은 가상 요청 연습이며 심판 통과 증거가 아닙니다.\n');
    if (results.some(item => !item.passed)) process.exitCode = 1;
  } catch (error) {
    process.stderr.write('판정기 연습 첫 오류: ' + error.message + '\n');
    process.exitCode = 1;
  } finally {
    if (previous === undefined) delete process.env.ALEPH_INSTRUCTOR_SUBJECT_IDS;
    else process.env.ALEPH_INSTRUCTOR_SUBJECT_IDS = previous;
  }
}
