// Self-check records only observations from actual HTTP requests, not judge decisions.
export async function runAttackChecks(config) {
  if (![1, 2, 3, 4, 5].includes(config.step)) {
    throw new Error('현재 자기 점검은 1~5단계만 지원합니다.');
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
      observed: visible ? '비로그인 요청에서 가상 자료 확인 표시가 보임'
        : '비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ' + response.status + ')',
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
        observed: apiVisible ? 'API가 확인 표시와 네 건의 자료를 반환함'
          : 'API가 예상한 가상 자료를 반환하지 않음 (HTTP ' + apiStatus + ')',
      },
      {
        attackId: 'static_data_removed',
        expected: '공개 /data.json 경로가 더는 자료를 제공하지 않음',
        observed: staticStatus === 404 ? '공개 /data.json 경로가 HTTP 404를 반환함'
          : '공개 /data.json 경로가 HTTP ' + staticStatus + '를 반환함',
      },
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
  checks.push({
    attackId: 'homepage_security_header',
    expected: '첫 HTML 응답에 nosniff 또는 Content-Security-Policy가 있음',
    observed: nosniff?.toLowerCase() === 'nosniff' || csp
      ? '첫 HTML 응답에서 보안 헤더를 확인함'
      : '첫 HTML 응답에서 보안 헤더를 확인하지 못함',
  });

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
    checks.push({
      attackId,
      expected: '인증 없는 요청은 HTTP 401/403과 JSON 오류로 거부',
      observed: denied ? '비로그인 요청을 JSON 오류로 거부함 (HTTP ' + status + ')'
        : '예상한 JSON 인증 거부를 확인하지 못함 (HTTP ' + status + ')',
    });
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
  checks.push({
    attackId: 'static_data_removed',
    expected: '공개 /data.json 경로가 404',
    observed: staticStatus === 404 ? '/data.json은 HTTP 404를 반환함'
      : '/data.json은 HTTP ' + staticStatus + '를 반환함',
  });

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
  checks.push({
    attackId: 'deployment_manifest',
    expected: '배포 /aleph.json이 열리고 단계 ' + config.step + '을 표시',
    observed: manifestMatches ? '/aleph.json에 단계 ' + config.step + ' 및 배포 식별 정보가 있음'
      : '/aleph.json 확인 실패 (HTTP ' + manifestStatus + ')',
  });

  if (config.step >= 4) {
    let dataApiStatus = 0;
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
    checks.push({
      attackId: 'anonymous_direct_data_api',
      expected: 'publishable/anon 키의 직접 Data API SELECT는 권한 오류로 거부',
      observed: anonDenied ? 'anon direct Data API는 권한 오류로 거부함 (HTTP ' + dataApiStatus + ')'
        : 'anon direct Data API 권한 거부를 확인하지 못함 (HTTP ' + dataApiStatus + ')',
    });
  }
  return checks;
}
