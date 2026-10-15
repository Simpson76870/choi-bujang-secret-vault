// Self-check records only actual HTTP observations; isolated judge checks remain not_run.

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
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) {
    throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  }

  if (config.step === 1) {
    const response = await fetch(new URL('/data.json', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    let visible = false;
    if (response.ok) {
      try {
        const data = await response.json();
        visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
          && data.notes.length > 0;
      } catch {
        // A non-JSON response is a failed check, not a successful deployment.
      }
    }
    return [{
      attackId: 'anonymous_note_read',
      expected: '비로그인 화면에서 가상 메모 확인 표시 관찰',
      observed: 'HTTP ' + response.status + (visible ? '; 가상 메모 확인 표시 관찰' : '; 확인 표시 미관찰'),
    }];
  }

  if (config.step === 2) {
    let apiStatus = 0;
    let apiVisible = false;
    try {
      const apiResponse = await fetch(new URL('/api/notes', app), {
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      apiStatus = apiResponse.status;
      if (apiResponse.ok) {
        try {
          const payload = await apiResponse.json();
          apiVisible = payload?.sampleMarker === config.sampleMarker
            && Array.isArray(payload.notes) && payload.notes.length === 4
            && payload.notes.every(note => typeof note?.title === 'string'
              && typeof note?.content === 'string');
        } catch {
          // Invalid JSON is recorded as a failed observation.
        }
      }
    } catch {
      apiStatus = 0;
    }

    let staticStatus = 0;
    try {
      const staticResponse = await fetch(new URL('/data.json', app), {
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      staticStatus = staticResponse.status;
    } catch {
      staticStatus = 0;
    }
    return [
      {
        attackId: 'anonymous_note_api',
        expected: '연습용 API에서 가상 자료 네 건을 확인',
        observed: apiStatus ? 'HTTP ' + apiStatus + (apiVisible ? '; 확인 표시와 네 건의 자료 관찰' : '; 예상 자료 미관찰') : 'not_run',
      },
      {
        attackId: 'static_data_removed',
        expected: '공개 /data.json 경로가 더는 자료를 제공하지 않음',
        observed: staticStatus ? 'HTTP ' + staticStatus : 'not_run',
      },
    ];
  }

  // The isolated judge does not expose its issued request IDs to this bundle process.
  // Keep judge-correlated checks unrun rather than attaching unrelated live requests.
  return [
    { attackId: 'static_note_read', expected: '정적 메모 0건', observed: 'not_run' },
    { attackId: 'anonymous_list', expected: '무로그인 목록 조회 401 또는 403', observed: 'not_run' },
    { attackId: 'anonymous_get', expected: '무로그인 개별 조회 401 또는 403', observed: 'not_run' },
  ];

}
