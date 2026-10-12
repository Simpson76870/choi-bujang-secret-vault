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
    response.setHeader('WWW-Authenticate', 'Bearer');
    response.status(401).json({
      error: 'AUTH_REQUIRED',
      message: '자료를 보려면 이메일과 비밀번호로 로그인해 주세요.',
    });
    return null;
  }
  return { ...runtime, identity };
}
