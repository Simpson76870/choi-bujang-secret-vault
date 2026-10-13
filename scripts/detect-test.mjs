import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const START = Date.UTC(2026, 9, 1, 0, 0, 0);
const subject = 'learner_fixture';
const deviceId = 'aaaaaaaaaaaaaaaa';
function reads(count, {
  intervalSeconds = 2,
  owner = subject,
  device = deviceId,
  network = 'unusual',
  method = 'GET',
  decision = 'allow',
  start = START,
  source = 'local_virtual_fixture',
} = {}) {
  return Array.from({ length: count }, (_, index) => ({
    at: new Date(start + index * intervalSeconds * 1000).toISOString(),
    subjectId: owner,
    deviceId: device,
    method,
    decision,
    network,
    source,
  }));
}
const proposal = { action: 'propose_revocation', reasonCode: 'burst_read', subject, deviceId };
const legacyVolumeOnly = Array.from({ length: 121 }, (_, index) => ({
  at: new Date(START + index * 2_000).toISOString(),
  method: 'GET',
  identity: { sub: subject },
}));

const cases = [
  { name: '정상 조회 30건', events: reads(30), expected: { action: 'observe' } },
  { name: '10분 안에 120건', events: reads(120), expected: { action: 'observe' } },
  { name: '10분 안에 121건과 비정상 네트워크', events: reads(121), expected: proposal },
  { name: '폭주 조회 200건과 비정상 네트워크', events: reads(200), expected: proposal },
  { name: '121건이어도 정상 네트워크면 관찰', events: reads(121, { network: 'usual' }),
    expected: { action: 'observe' } },
  { name: '허용되지 않은 조회는 집계하지 않음', events: reads(121, { decision: 'deny' }),
    expected: { action: 'observe' } },
  { name: 'GET이 아닌 쓰기는 집계하지 않음', events: reads(121, { method: 'PUT' }),
    expected: { action: 'observe' } },
  { name: '서로 다른 사용자 각 100건', events: [...reads(100),
    ...reads(100, { owner: 'other_fixture' })].sort((a, b) => a.at.localeCompare(b.at)),
    expected: { action: 'observe' } },
  { name: '서로 다른 기기 각 100건', events: [...reads(100),
    ...reads(100, { device: 'bbbbbbbbbbbbbbbb' })].sort((a, b) => a.at.localeCompare(b.at)),
    expected: { action: 'observe' } },
  { name: '10분 밖으로 흩어진 조회 200건', events: reads(200, { intervalSeconds: 7 }),
    expected: { action: 'observe' } },
  { name: '기기·네트워크 증거가 없는 레거시 사건은 회수하지 않음',
    events: legacyVolumeOnly, expected: { action: 'observe' } },
];

export async function checkDetection(detect) {
  if (typeof detect !== 'function') throw new TypeError('src/detect.mjs에서 detect 함수를 내보내야 합니다.');
  const results = [];
  for (const item of cases) {
    const actual = await detect(item.events);
    const passed = isDeepStrictEqual(actual, item.expected);
    results.push({ name: item.name, passed: Boolean(passed) });
  }
  return results;
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
