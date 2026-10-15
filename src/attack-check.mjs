// 제출 격리 환경에서 실제 요청 응답 기록을 확인할 수 없는 점검은 성공을 계산하지 않고 미실행으로 남깁니다.
export async function runAttackChecks(config) {
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(config.step)) {
    throw new Error('현재 자기 점검은 1~12단계만 지원합니다.');
  }
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  // Judge submission runs in an isolated environment. Do not fabricate HTTP observations
  // or attach unrelated production requests to judge-issued request records.
  return [
    { attackId: 'static_note_read', expected: '정적 메모 0건', observed: 'not_run' },
    { attackId: 'anonymous_list', expected: '무로그인 목록 조회 401 또는 403', observed: 'not_run' },
    { attackId: 'anonymous_get', expected: '무로그인 개별 조회 401 또는 403', observed: 'not_run' },
  ];
}
