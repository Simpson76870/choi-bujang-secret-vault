import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';

const config = {
  step: 2,
  judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
  sampleMarker: 'SAMPLE_NOTE_1',
  publicAppUrl: 'https://student-defense.vercel.app',
};
const env = {
  VERCEL_GIT_PROVIDER: 'github',
  VERCEL_GIT_REPO_OWNER: 'Student-A',
  VERCEL_GIT_REPO_SLUG: 'aleph-defense',
  VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
  VERCEL_URL: 'student-defense-123.vercel.app',
};

test('deployment identity accepts stage 2 and uses Vercel metadata', () => {
  assert.deepEqual(deploymentIdentity(env, config), {
    schema: 'aleph.defense.deployment.v1',
    step: 2,
    repoUrl: 'https://github.com/student-a/aleph-defense',
    commit: 'a'.repeat(40),
    publicAppUrl: 'https://student-defense-123.vercel.app',
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
  });
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_PROVIDER: undefined }, config));
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_COMMIT_SHA: 'short' }, config));
  assert.throws(() => deploymentIdentity(env, { ...config, step: 13 }));
});

test('stage 2 attack checks request API data and verify static JSON is absent', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith('/api/notes')) {
        return new Response(JSON.stringify({
          sampleMarker: 'SAMPLE_NOTE_1',
          notes: [
            { title: 'fixture-a', content: 'sample-a' },
            { title: 'fixture-b', content: 'sample-b' },
            { title: 'fixture-c', content: 'sample-c' },
            { title: 'fixture-d', content: 'sample-d' },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
    };
    const results = await runAttackChecks(config);
    assert.equal(results.length, 2);
    assert.match(results[0].observed, /확인 표시와 네 건/u);
    assert.match(results[1].observed, /HTTP 404/u);
    assert.deepEqual(requests.map(item => item.url), [
      'https://student-defense.vercel.app/api/notes',
      'https://student-defense.vercel.app/data.json',
    ]);
    assert.equal(requests[0].init.redirect, 'error');
    assert.equal(requests[0].init.cache, 'no-store');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
