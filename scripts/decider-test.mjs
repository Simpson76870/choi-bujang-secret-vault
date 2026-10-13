import { randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureRequests } from './fixture-7.mjs';

const RESPONSE_KEYS = 'decision,reasonCode,requestId,ruleIds,schema';
function validResponse(request, response, ruleIds) {
  return response && typeof response === 'object' && !Array.isArray(response)
    && Object.keys(response).sort().join(',') === RESPONSE_KEYS
    && response.schema === 'aleph.decision.v1'
    && response.requestId === request.requestId
    && ['allow', 'deny', 'step_up'].includes(response.decision)
    && typeof response.reasonCode === 'string'
    && /^[a-z][a-z0-9_]{0,63}$/u.test(response.reasonCode)
    && Array.isArray(response.ruleIds) && response.ruleIds.length > 0
    && response.ruleIds.every(id => ruleIds.includes(id));
}
export async function checkDecider({ decide, ruleIds }) {
  if (typeof decide !== 'function' || !Array.isArray(ruleIds)
      || !['device_registered', 'step_up_required', 'resource_scope'].every(id => ruleIds.includes(id))) {
    throw new Error('8단계 resource_scope 규칙을 RULE_IDS에 구현해 주세요.');
  }
  const { normal, suspicious } = fixtureRequests();
  const otherSubject = { ...normal, requestId: randomUUID(), subjectId: 'learner_b_fixture' };
  const otherClass = { ...normal, requestId: randomUUID(), classId: 'class_other' };
  const otherProject = { ...normal, requestId: randomUUID(), projectId: 'project_other' };
  const otherDevice = { ...normal, requestId: randomUUID(), deviceId: 'bbbbbbbbbbbbbbbb' };
  const otherMemo = { ...normal, requestId: randomUUID(), path: '/notes/other-demo' };
  const list = { ...normal, requestId: randomUUID(), path: '/notes', route: 'GET /notes' };
  const exportPath = { ...normal, requestId: randomUUID(), path: '/notes/demo/export' };
  const queryChoice = { ...normal, requestId: randomUUID(), queryLength: 4,
    querySha256: createHash('sha256').update('id=demo').digest('hex') };
  const noticeEdit = { ...normal, requestId: randomUUID(), service: 'notices',
    method: 'PUT', path: '/notices/demo', route: 'PUT /notices/:id' };
  const studentAnnouncementEdit = { ...normal, requestId: randomUUID(), service: 'announcements',
    method: 'PUT', path: '/announcements/demo', route: 'PUT /announcements/:id' };
  const instructorAnnouncementEdit = { ...normal, requestId: randomUUID(),
    subjectId: 'instructor_fixture', deviceId: 'bbbbbbbbbbbbbbbb',
    service: 'announcements', method: 'PUT', path: '/announcements/demo',
    route: 'PUT /announcements/:id' };
  const instructorNoticeEdit = { ...normal, requestId: randomUUID(),
    subjectId: 'instructor_fixture', deviceId: 'bbbbbbbbbbbbbbbb',
    service: 'notices', method: 'PUT', path: '/notices/demo',
    route: 'PUT /notices/:id' };
  const crossedResourcePath = { ...normal, requestId: randomUUID(),
    service: 'notes', method: 'PUT', path: '/announcements/demo', route: 'PUT /notes/:id' };
  const forgedOwnerField = { ...normal, requestId: randomUUID(),
    resourceOwnerSubjectId: 'learner_b_fixture' };
  const forgedStudentRole = { ...instructorAnnouncementEdit, requestId: randomUUID(),
    role: 'student' };
  const nestedRole = { ...instructorAnnouncementEdit, requestId: randomUUID(),
    stepUp: { ...instructorAnnouncementEdit.stepUp, role: 'student' } };
  const forgedSignalIdentity = { ...normal, requestId: randomUUID(),
    signals: { ...normal.signals, subjectId: 'learner_b_fixture' } };
  const checks = [
    { name: '제공된 본인 메모 /notes/demo 읽기 허용', request: normal, decision: 'allow', reasonCode: 'approved' },
    { name: '제공된 본인 메모 수정 허용', request: { ...normal, requestId: randomUUID(),
      method: 'PUT', route: 'PUT /notes/:id' }, decision: 'allow', reasonCode: 'approved' },
    { name: '미등록 기기 거부', request: { ...normal, requestId: randomUUID(),
      deviceRegistered: false }, decision: 'deny', reasonCode: 'device_not_registered' },
    { name: '복합 이상 접속은 추가 확인', request: suspicious, decision: 'step_up',
      reasonCode: 'step_up_required' },
    { name: '새 로그인 확인 후 복합 이상 재판정', request: { ...suspicious,
      requestId: randomUUID(), stepUp: { verified: true, authAgeSeconds: 60 } }, decision: 'allow' },
    { name: '지역 하나만 다른 정상 조합 허용', request: { ...normal, requestId: randomUUID(),
      signals: { ...normal.signals, region: 'foreign' } }, decision: 'allow' },
    { name: '엔진 위치 신호 없음도 본인 자원은 허용', request: { ...normal,
      requestId: randomUUID(), signals: { source: 'none', region: 'unknown', network: 'unknown', hour: 14 } },
      decision: 'allow' },
    { name: '다른 주체가 같은 메모를 읽는 요청 거부', request: otherSubject, decision: 'deny',
      reasonCode: 'resource_not_allowed' },
    { name: '다른 반의 메모 거부', request: otherClass, decision: 'deny', reasonCode: 'resource_not_allowed' },
    { name: '다른 프로젝트의 메모 거부', request: otherProject, decision: 'deny', reasonCode: 'resource_not_allowed' },
    { name: '다른 기기의 메모 거부', request: otherDevice, decision: 'deny', reasonCode: 'resource_not_allowed' },
    { name: '등록되지 않은 다른 메모 ID 거부', request: otherMemo, decision: 'deny',
      reasonCode: 'resource_not_allowed' },
    { name: '메모 목록 기본 거부', request: list, decision: 'deny', reasonCode: 'resource_not_allowed' },
    { name: '일반 학생의 강사 알림 수정 거부', request: noticeEdit, decision: 'deny',
      reasonCode: 'resource_not_allowed' },
    { name: '일반 학생의 공지 수정 거부', request: studentAnnouncementEdit, decision: 'deny',
      reasonCode: 'resource_not_allowed' },
    { name: '등록된 강사의 공지 자원 수정 허용', request: instructorAnnouncementEdit,
      decision: 'allow', reasonCode: 'approved' },
    { name: '등록된 강사의 notices 별칭 수정 허용', request: instructorNoticeEdit,
      decision: 'allow', reasonCode: 'approved' },
    { name: '메모 서비스로 공지 경로에 접근하는 요청 거부', request: crossedResourcePath,
      decision: 'deny', reasonCode: 'resource_not_allowed' },
    { name: 'export 같은 추가 경로 거부', request: exportPath, decision: 'deny',
      reasonCode: 'resource_not_allowed' },
    { name: '쿼리로 기능/자원 선택하는 요청 거부', request: queryChoice, decision: 'deny',
      reasonCode: 'resource_not_allowed' },
    { name: '요청 본문의 비계약 소유자 필드 거부', request: forgedOwnerField, decision: 'deny',
      reasonCode: 'resource_not_allowed' },
    { name: '강사 주체에 학생 역할을 덧붙인 요청 거부', request: forgedStudentRole, decision: 'deny',
      reasonCode: 'resource_not_allowed' },
    { name: 'stepUp 중첩 객체의 비계약 역할 필드 거부', request: nestedRole, decision: 'deny',
      reasonCode: 'resource_not_allowed' },
    { name: '신호 객체에 임의 사용자 필드를 덧붙인 요청 거부', request: forgedSignalIdentity,
      decision: 'deny', reasonCode: 'resource_not_allowed' },
  ];
  const results = [];
  for (const item of checks) {
    const result = await decide(item.request);
    const passed = validResponse(item.request, result, ruleIds)
      && result.decision === item.decision
      && (!item.reasonCode || result.reasonCode === item.reasonCode);
    results.push({ name: item.name, passed });
  }
  return results;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    // Run against the default starter binding, without injecting a local owner map.
    const { decide, RULE_IDS } = await import('../src/decider.mjs');
    const results = await checkDecider({ decide, ruleIds: RULE_IDS });
    for (const item of results) process.stdout.write((item.passed ? '통과' : '확인 필요') + ' · ' + item.name + '\n');
    process.stdout.write('이 명령은 가상 요청 연습이며 심판 판정은 아닙니다.\n');
    if (results.some(item => !item.passed)) process.exitCode = 1;
  } catch (error) {
    process.stderr.write('판정기 연습 첫 오류: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
