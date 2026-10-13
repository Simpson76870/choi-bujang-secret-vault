import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const START = Date.UTC(2026, 9, 1, 0, 0, 0);
const subject = 'learner_fixture';
const deviceId = 'aaaaaaaaaaaaaaaa';

const legacyReads = (count, { intervalSeconds = 2, owner = subject } = {}) =>
  Array.from({ length: count }, (_, index) => ({
    at: new Date(START + index * intervalSeconds * 1000).toISOString(),
    method: 'GET',
    identity: { sub: owner },
  }));
const virtualEvents = (count, { network = 'unusual', decision = 'allow', method = 'GET', owner = subject } = {}) =>
  Array.from({ length: count }, (_, index) => ({
    at: new Date(START + index * 2_000).toISOString(),
    subjectId: owner, deviceId, method, decision, network, source: 'local_virtual_fixture',
  }));

const expectedBurst = { action: 'propose_revocation', reasonCode: 'burst_read', subject };
const expectedComposite = { ...expectedBurst, deviceId };

export async function checkDetection(detector) {
  if (typeof detector !== 'function') throw new TypeError('src/detect.mjs에서 detect 함수를 내보내야 합니다.');
  const { detectDeviceAnomaly, revocationProposal } = await import('../src/detect.mjs');
  const cases = [
    { name: '기본 계약: GET 30건은 관찰', actual: await detector(legacyReads(30)), expected: { action: 'observe' } },
    { name: '기본 계약: 정확히 120건은 관찰', actual: await detector(legacyReads(120)), expected: { action: 'observe' } },
    { name: '기본 계약: 10분 내 GET 121건은 탐지', actual: await detector(legacyReads(121)), expected: expectedBurst },
    { name: '기본 계약: 다른 사용자의 조회는 합산하지 않음',
      actual: await detector([...legacyReads(100), ...legacyReads(100, { owner: 'other_fixture' })]), expected: { action: 'observe' } },
    { name: '복합 계약: 조회 폭주 + 비정상 네트워크는 단일 기기 제안',
      actual: revocationProposal(virtualEvents(121)), expected: expectedComposite },
    { name: '복합 계약: 정상 네트워크는 제안 없음',
      actual: revocationProposal(virtualEvents(121, { network: 'usual' })), expected: null },
    { name: '복합 계약: 거부된 읽기는 집계하지 않음',
      actual: detectDeviceAnomaly(virtualEvents(121, { decision: 'deny' })), expected: { suspicious: false } },
  ];
  return cases.map(item => ({ name: item.name, passed: isDeepStrictEqual(item.actual, item.expected) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { detect } = await import('../src/detect.mjs');
    const results = await checkDetection(detect);
    for (const item of results) process.stdout.write(`${item.passed ? '통과' : '확인 필요'} · ${item.name}\n`);
    process.stdout.write('가상 사건 연습이며 실제 접속 회수나 심판 통과 증거가 아닙니다.\n');
    if (results.some(item => !item.passed)) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`탐지 연습 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
