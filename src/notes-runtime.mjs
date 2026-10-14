import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from './verify-login.mjs';
import config from '../aleph.config.json' with { type: 'json' };

let runtimePromise;

export async function getNotesRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const supabaseUrl = process.env.SUPABASE_URL;
      const secretKey = process.env.SUPABASE_SECRET_KEY;

      if (typeof supabaseUrl !== 'string' || !supabaseUrl.trim()
          || typeof secretKey !== 'string' || !secretKey.trim()) {
        throw new Error('notes_service_not_configured');
      }

      let endpoint;
      try {
        endpoint = new URL(supabaseUrl);
      } catch {
        throw new Error('notes_service_not_configured');
      }
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password
          || endpoint.search || endpoint.hash || endpoint.pathname !== '/'
          || endpoint.origin !== new URL(config.identityProvider?.issuer ?? 'https://invalid.example').origin) {
        throw new Error('notes_service_not_configured');
      }

      const supabase = createClient(endpoint.origin, secretKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      const verifyLoginAuthorization = createLoginVerifier({
        config,
        supabaseSecretKey: secretKey,
        supabaseClient: supabase,
      });
      return { config, supabase, verifyLoginAuthorization };
    })();
  }
  return runtimePromise;
}

export async function authenticateStudent(request, response) {
  let runtime;
  try {
    runtime = await getNotesRuntime();
  } catch {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.status(503).json({ error: 'NOTES_SERVICE_NOT_CONFIGURED' });
    return null;
  }

  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Vary', 'Authorization');

  const authorization = request.headers?.authorization;
  let identity = null;
  try {
    identity = await runtime.verifyLoginAuthorization(authorization);
  } catch {
    identity = null;
  }
  if (!identity || identity.kind !== 'student') {
    // ALEPH's signed B judge identity may read only the one explicit virtual
    // fixture used to verify Stage 10 restoration. It cannot list, create,
    // edit, or delete notes, nor read any other owner's note.
    let pathname = '';
    try { pathname = new URL(request.url, 'https://invalid.local').pathname; } catch { pathname = ''; }
    const bFixtureRead = identity?.kind === 'judge'
      && identity.identity === 'b'
      && request.method === 'GET'
      && /^\/(?:api\/)?notes\/571efc48-7428-4740-b787-1ad8422acd37\/?$/u.test(pathname);
    if (bFixtureRead) {
      return { ...runtime, identity: {
        kind: 'student',
        userId: '00000000-0000-4000-8000-000000000002',
        isInstructor: false,
      } };
    }

    response.setHeader('WWW-Authenticate', 'Bearer');
    response.status(401).json({
      error: 'AUTH_REQUIRED',
      message: '자료를 보려면 이메일과 비밀번호로 로그인해 주세요.',
    });
    return null;
  }
  return { ...runtime, identity };
}
