// Self-check records only observations from actual HTTP requests, not judge decisions.
function requestRecord({ attackId, expected, method = 'GET', path, status, details = '' }) {
  const caseId = attackId;
  const requestKey = method + ' ' + path;
  const observed = Number.isInteger(status)
    ? 'HTTP ' + status + (details ? '; ' + details : '')
    : 'not_run';
  return { attackId, caseId, requestKey, expected, observed };
}

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
    return [requestRecord({
      attackId: 'anonymous_note_read',
      path: '/data.json',
      status: response.status,
      expected: '비로그인 화면에서 가상 메모 확인 표시 관찰',
      details: visible ? '가상 메모 확인 표시 관찰' : '확인 표시 미관찰',
    })];
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
      requestRecord({
        attackId: 'anonymous_note_api', path: '/api/notes', status: apiStatus || null,
        expected: '연습용 API에서 가상 자료 네 건을 확인',
        details: apiVisible ? '가상 자료 네 건 관찰' : '예상 자료 미관찰',
      }),
      requestRecord({
        attackId: 'static_data_removed', path: '/data.json', status: staticStatus || null,
        expected: '공개 /data.json 경로가 더는 자료를 제공하지 않음',
      }),
    ];
  }

  const checks = [];
  const appResponse = await fetch(app, {
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  const nosniff = appResponse.headers.get('x-content-type-options');
  const csp = appResponse.headers.get('content-security-policy');
  const homeHtml = await appResponse.text().catch(() => '');
  const publishableKey = /const\s+SUPABASE_PUBLISHABLE_KEY\s*=\s*['"]([^'"]+)['"]/u.exec(homeHtml)?.[1] ?? null;
  checks.push(requestRecord({
    attackId: 'homepage_security_header', path: '/', status: appResponse.status,
    expected: '첫 HTML 응답에 nosniff 또는 Content-Security-Policy가 있음',
    details: 'x-content-type-options=' + (nosniff ?? '없음') + '; content-security-policy=' + (csp ? '있음' : '없음'),
  }));

  for (const [attackId, path] of [
    ['anonymous_notes_list', '/api/notes'],
    ['anonymous_note_item', '/api/notes/00000000-0000-4000-8000-000000000099'],
  ]) {
    let status = 0;
    let isJson = false;
    let hasError = false;
    try {
      const response = await fetch(new URL(path, app), {
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      status = response.status;
      isJson = (response.headers.get('content-type') || '').toLowerCase().includes('application/json');
      const payload = await response.json().catch(() => null);
      hasError = typeof payload?.error === 'string' && payload.error.length > 0;
    } catch {
      status = 0;
    }
    const denied = [401, 403].includes(status) && isJson && hasError;
    checks.push(requestRecord({
      attackId, path, status: status || null,
      expected: '인증 없는 요청은 HTTP 401/403과 JSON 오류로 거부',
      details: 'content-type=' + (isJson ? 'application/json' : '비JSON/없음') + '; error=' + (hasError ? '있음' : '없음'),
    }));
  }

  let staticStatus = 0;
  try {
    const response = await fetch(new URL('/data.json', app), {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    staticStatus = response.status;
  } catch {
    staticStatus = 0;
  }
  checks.push(requestRecord({
    attackId: 'static_data_removed', path: '/data.json', status: staticStatus || null,
    expected: '공개 /data.json 경로가 404',
  }));

  let manifestStatus = 0;
  let manifestMatches = false;
  try {
    const response = await fetch(new URL('/aleph.json', app), {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    manifestStatus = response.status;
    if (response.ok) {
      const manifest = await response.json();
      manifestMatches = manifest?.step === config.step
        && typeof manifest.commit === 'string'
        && /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/u.test(manifest.repoUrl)
        && typeof manifest.publicAppUrl === 'string';
    }
  } catch {
    manifestStatus = 0;
  }
  checks.push(requestRecord({
    attackId: 'deployment_manifest', path: '/aleph.json', status: manifestStatus || null,
    expected: '배포 /aleph.json이 열리고 단계 ' + config.step + '을 표시',
    details: 'step=' + (manifestMatches ? config.step : '확인 실패'),
  }));

  if (config.step >= 4) {
    let dataApiStatus = 0;
    let dataApiPath = '/rest/v1/training_notes';
    if (publishableKey) {
      try {
        const apiBase = config.identityProvider.issuer.replace(/\/auth\/v1\/?$/u, '');
        const directUrl = config.step >= 5
          ? new URL(config.originalApiUrl)
          : new URL('/rest/v1/training_notes', apiBase);
        if (directUrl.protocol !== 'https:' || directUrl.origin !== apiBase
            || directUrl.pathname !== '/rest/v1/training_notes'
            || directUrl.search || directUrl.hash) {
          throw new Error('originalApiUrl must be the query-free HTTPS training_notes endpoint.');
        }
        dataApiPath = directUrl.pathname;
        directUrl.searchParams.set('select', 'id');
        directUrl.searchParams.set('limit', '1');
        const directResponse = await fetch(directUrl, {
          headers: { apikey: publishableKey, Accept: 'application/json' },
          cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
        });
        dataApiStatus = directResponse.status;
        await directResponse.arrayBuffer().catch(() => undefined);
      } catch {
        dataApiStatus = 0;
      }
    }
    const anonDenied = [401, 403].includes(dataApiStatus);
    checks.push(requestRecord({
      attackId: 'anonymous_direct_data_api', path: dataApiPath, status: dataApiStatus || null,
      expected: 'publishable/anon 키의 직접 Data API SELECT는 권한 오류로 거부',
      details: anonDenied ? 'anon 권한 거부 확인' : 'anon 권한 거부 미확인',
    }));
  }
  if (config.step >= 10) {
    for (const [attackId, path] of [
      ['notes_audit_unauthenticated', '/api/notes/audit'],
      ['restore_note_unauthenticated', '/api/restore/notes/571efc48-7428-4740-b787-1ad8422acd37'],
    ]) {
      let status = 0;
      let isJson = false;
      let hasError = false;
      try {
        const response = await fetch(new URL(path, app), {
          method: 'GET', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
        });
        status = response.status;
        isJson = (response.headers.get('content-type') || '').toLowerCase().includes('application/json');
        const payload = await response.json().catch(() => null);
        hasError = typeof payload?.error === 'string' && payload.error.length > 0;
      } catch { status = 0; }
      const denied = [401, 403].includes(status) && isJson && hasError;
      checks.push(requestRecord({
        attackId, path, status: status || null,
        expected: '복구와 감사 경로는 인증 없는 요청을 JSON 오류로 거부',
        details: 'content-type=' + (isJson ? 'application/json' : '비JSON/없음') + '; error=' + (hasError ? '있음' : '없음'),
      }));
    }
  }
  return checks;
}
