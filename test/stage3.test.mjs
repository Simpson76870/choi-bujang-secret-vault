import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoginVerifier } from '../src/verify-login.mjs';
import collectionHandler from '../api/notes.js';
import itemHandler from '../api/notes/[id].js';

const studentIssuer = 'https://hjuczlxovnghkljzygoz.supabase.co/auth/v1';
const userId = 'b91a80aa-42aa-4a18-a254-0ee0ea5e0a55';
const appConfig = {
  step: 3,
  judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
  publicAppUrl: 'https://stage3-test.vercel.app',
  sampleMarker: 'SAMPLE_NOTE_1',
  identityProvider: {
    issuer: studentIssuer,
    audience: 'authenticated',
    jwksUrl: studentIssuer + '/.well-known/jwks.json',
  },
  allowedRoutes: [
    'GET /api/notes', 'POST /api/notes', 'GET /api/notes/:id',
    'PUT /api/notes/:id', 'DELETE /api/notes/:id',
  ],
};

function token(payload) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode(payload) + '.c2lnbmF0dXJl';
}

function responseRecorder() {
  return {
    headers: new Map(),
    statusCode: 0,
    payload: undefined,
    setHeader(name, value) { this.headers.set(name.toLowerCase(), value); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}

test('verify-login accepts only claims returned by Supabase verification', async () => {
  const calls = [];
  const supabaseClient = {
    auth: {
      async getClaims(accessToken) {
        calls.push(accessToken);
        return {
          data: { claims: {
            iss: studentIssuer,
            aud: 'authenticated',
            role: 'authenticated',
            sub: userId,
            exp: Math.floor(Date.now() / 1000) + 300,
          } },
          error: null,
        };
      },
    },
  };
  const verifier = createLoginVerifier({
    config: appConfig,
    supabaseClient,
    judgeKeySet: () => undefined,
  });

  assert.equal(await verifier(undefined), null);
  assert.equal(await verifier('Basic abc'), null);
  const accessToken = token({ iss: studentIssuer, sub: userId });
  assert.deepEqual(await verifier('Bearer ' + accessToken), { kind: 'student', userId, isInstructor: false });
  assert.deepEqual(calls, [accessToken]);
});


test('only verified server-managed app_metadata grants instructor capability', async () => {
  const scenarios = [
    { app_metadata: { role: 'instructor' }, user_metadata: { role: 'student' }, isInstructor: true },
    { app_metadata: { role: 'student' }, user_metadata: { role: 'instructor' }, isInstructor: false },
    { user_metadata: { role: 'instructor' }, isInstructor: false },
  ];
  for (const scenario of scenarios) {
    const supabaseClient = {
      auth: {
        async getClaims() {
          return {
            data: { claims: {
              iss: studentIssuer,
              aud: 'authenticated',
              role: 'authenticated',
              sub: userId,
              exp: Math.floor(Date.now() / 1000) + 300,
              app_metadata: scenario.app_metadata,
              user_metadata: scenario.user_metadata,
            } },
            error: null,
          };
        },
      },
    };
    const verifier = createLoginVerifier({
      config: appConfig,
      supabaseClient,
      judgeKeySet: () => undefined,
    });
    const accessToken = token({ iss: studentIssuer, sub: userId });
    assert.deepEqual(await verifier('Bearer ' + accessToken), {
      kind: 'student', userId, isInstructor: scenario.isInstructor,
    });
  }
});

test('unauthenticated collection and item APIs return JSON 401 responses', async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = 'https://hjuczlxovnghkljzygoz.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-key-for-unit-tests-only';

  try {
    const collectionResponse = responseRecorder();
    await collectionHandler({ method: 'GET', headers: {} }, collectionResponse);
    assert.equal(collectionResponse.statusCode, 401);
    assert.equal(collectionResponse.payload.error, 'AUTH_REQUIRED');
    assert.equal(collectionResponse.headers.get('www-authenticate'), 'Bearer');

    const itemResponse = responseRecorder();
    await itemHandler({
      method: 'GET',
      url: '/api/notes/00000000-0000-4000-8000-000000000099',
      query: { id: '00000000-0000-4000-8000-000000000099' },
      headers: {},
    }, itemResponse);
    assert.equal(itemResponse.statusCode, 401);
    assert.equal(itemResponse.payload.error, 'AUTH_REQUIRED');
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousKey;
  }
});
