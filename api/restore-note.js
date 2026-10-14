import config from '../aleph.config.json' with { type: 'json' };
import { getNotesRuntime } from '../src/notes-runtime.mjs';
import {
  decodeSnapshotBase64, previewNoteRestore, restoreNoteOnce, verifyNoteBackup,
} from '../src/recovery/note.mjs';
import { appendRecoveryAudit, getOperationsReport, getRecoveryAuditForOwner, recordOperation } from '../src/recovery/ledger.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA = /^[a-f0-9]{64}$/u;

function send(response, status, payload) {
  return response.status(status).json(payload);
}
function noStore(response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('CDN-Cache-Control', 'no-store');
  response.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
}
function errorCode(error, allowed) {
  return allowed.includes(error?.message) ? error.message : 'RESTORE_FAILED';
}
function snapshotInputs(env) {
  if (env.RESTORE_ENABLED !== '1') throw new Error('RESTORE_DISABLED');
  const raw = decodeSnapshotBase64(env.RESTORE_NOTE_SNAPSHOT_BASE64);
  if (!raw || !SHA.test(env.RESTORE_NOTE_BACKUP_SHA256 ?? '')
      || !env.RESTORE_INCIDENT_AT || !env.RESTORE_B_OWNER_ID
      || !env.RESTORE_OPERATOR_USER_ID || !env.SUPABASE_URL
      || !env.SUPABASE_SECRET_KEY) {
    throw new Error('VERIFIED_BACKUP_NOT_CONFIGURED');
  }
  const input = {
    raw,
    trustedSha256: env.RESTORE_NOTE_BACKUP_SHA256,
    incidentAt: env.RESTORE_INCIDENT_AT,
    pinnedBOwnerId: env.RESTORE_B_OWNER_ID,
  };
  const verified = verifyNoteBackup(input);
  if (verified.row.owner_id !== env.RESTORE_OPERATOR_USER_ID) {
    throw new Error('RESTORE_OPERATOR_NOT_PINNED');
  }
  return input;
}
function requestedId(request) {
  const value = Array.isArray(request.query?.id) ? null : request.query?.id;
  return typeof value === 'string' && UUID.test(value) ? value : null;
}
function confirmationBody(request) {
  try {
    const raw = typeof request.body === 'string'
      ? request.body
      : JSON.stringify(request.body ?? null);
    if (typeof raw !== 'string' || raw.length > 256) return null;
    const value = JSON.parse(raw);
    // Confirmation is the only permitted request field. Owner, role, ID,
    // title, content, and hashes other than the plan hash are never accepted.
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).sort().join(',') !== 'planSha256'
        || !SHA.test(value.planSha256 ?? '')) return null;
    return value;
  } catch { return null; }
}

function noteStore(db) {
  async function find(id) {
    const { data, error } = await db.from('training_notes')
      .select('id,owner_id,title,content').eq('id', id).maybeSingle();
    if (error) throw new Error('RESTORE_BACKEND_ERROR');
    return data;
  }
  return {
    find,
    async restoreVerified(row, previous) {
      if (previous && (previous.id !== row.id || previous.owner_id !== row.owner_id)) {
        throw new Error('NOTE_OWNER_CONFLICT');
      }
      let result;
      if (!previous) {
        result = await db.from('training_notes').insert({
          id: row.id, owner_id: row.owner_id, title: row.title, content: row.body,
        }).select('id,owner_id,title,content').maybeSingle();
      } else {
        // Compare-and-swap prevents overwriting a row changed after the preview.
        result = await db.from('training_notes').update({
          title: row.title, content: row.body,
        }).eq('id', row.id)
          .eq('owner_id', row.owner_id)
          .eq('title', previous.title)
          .eq('content', previous.body ?? previous.content)
          .select('id,owner_id,title,content').maybeSingle();
      }
      if (result.error || !result.data || result.data.id !== row.id
          || result.data.owner_id !== row.owner_id) {
        throw new Error(result.error?.code === '23505' ? 'NOTE_CHANGED_DURING_RESTORE' : 'RESTORE_BACKEND_ERROR');
      }

      // Read back the saved row and verify the digest before declaring success.
      const saved = await find(row.id);
      if (!saved || saved.owner_id !== row.owner_id
          || saved.title !== row.title || saved.content !== row.body) {
        throw new Error('POST_RESTORE_VERIFICATION_FAILED');
      }
      return { id: saved.id, transactionalReadbackVerified: true };
    },
  };
}

async function findForeignNote(db, ownerId, restoredId) {
  try {
    const { data, error } = await db.from('training_notes')
      .select('id,owner_id').neq('owner_id', ownerId).limit(1).maybeSingle();
    if (error || !data || data.owner_id === ownerId
        || data.id === restoredId || !UUID.test(data.id ?? '')) return null;
    return data.id;
  } catch { return null; }
}

function retestBase(request, env) {
  const configured = env.RESTORE_PUBLIC_APP_URL || config.publicAppUrl;
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
        || url.pathname !== '/' || !url.hostname.endsWith('.vercel.app')) return null;
    return url;
  } catch { return null; }
}

async function runLiveRetests({ request, env, db, note, fetchImpl }) {
  const result = {
    normal: { attempted: false, status: null, passed: false },
    forbidden: { attempted: false, status: null, passed: false },
    passed: false,
  };
  const base = retestBase(request, env);
  const authorization = request.headers?.authorization;
  if (!base || typeof authorization !== 'string' || !/^Bearer\\s+\\S+/u.test(authorization)) return result;

  const requestGet = async path => {
    const url = new URL(path, base);
    try {
      const response = await fetchImpl(url, {
        method: 'GET', cache: 'no-store', redirect: 'error',
        headers: { authorization, accept: 'application/json' },
        signal: AbortSignal.timeout(7000),
      });
      const body = await response.json().catch(() => null);
      return { status: response.status, body };
    } catch {
      return { status: null, body: null };
    }
  };

  result.normal.attempted = true;
  const own = await requestGet('/api/notes/' + note.id);
  result.normal.status = own.status;
  result.normal.passed = own.status === 200
    && own.body?.id === note.id
    && own.body?.title === note.title
    && own.body?.body === note.body;

  const foreignId = await findForeignNote(db, note.owner_id, note.id);
  if (foreignId) {
    result.forbidden.attempted = true;
    const other = await requestGet('/api/notes/' + foreignId);
    result.forbidden.status = other.status;
    result.forbidden.passed = other.status === 404
      && other.body?.error === 'NOTE_NOT_FOUND';
  }

  result.passed = result.normal.attempted && result.normal.passed
    && result.forbidden.attempted && result.forbidden.passed;
  return result;
}

export function createRestoreHandler({
  env = process.env,
  runtimeLoader = getNotesRuntime,
  fetchImpl = fetch,
} = {}) {
  let runtimePromise;
  return async function handler(request, response) {
    noStore(response);
    response.setHeader('X-ALEPH-Recovery-Evidence', 'not-run');
    response.setHeader('X-ALEPH-Live-Retest', 'not-run');

    // Vercel rewrites audit and operations to this same function so process-local
    // append-only observations have one function instance/runtime scope.
    if (request.query?.action === 'operations') {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
      }
      const report = getOperationsReport();
      return send(response, 200, {
        ...report,
        step: config.step,
        restoreRoute: config.restoreRoute,
        auditHistory: {
          status: report.recoveryAuditEvents > 0 ? 'measured' : 'not_run',
          entries: report.recoveryAuditEvents,
          storage: 'process_local_append_only',
        },
      });
    }
    if (request.query?.action === 'audit') {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
      }
      let authRuntime;
      try {
        if (!runtimePromise) runtimePromise = Promise.resolve(runtimeLoader());
        authRuntime = await runtimePromise;
      } catch {
        return send(response, 503, { error: 'RESTORE_SERVICE_UNAVAILABLE' });
      }
      let auditIdentity = null;
      try { auditIdentity = await authRuntime.verifyLoginAuthorization(request.headers?.authorization); }
      catch { auditIdentity = null; }
      if (!auditIdentity || auditIdentity.kind !== 'student') {
        response.setHeader('WWW-Authenticate', 'Bearer');
        return send(response, 401, { error: 'UNAUTHORIZED' });
      }
      return send(response, 200, {
        schema: 'aleph.note-audit.v1',
        events: getRecoveryAuditForOwner(auditIdentity.userId),
        storage: 'process_local_append_only',
      });
    }
    if (request.query?.action && request.query.action !== 'restore') {
      return send(response, 404, { error: 'ROUTE_NOT_FOUND' });
    }

    if (!['GET', 'POST'].includes(request.method)) {
      response.setHeader('Allow', 'GET, POST');
      return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    }

    let inputs;
    try {
      inputs = snapshotInputs(env);
      recordOperation('backup_outer_sha256', { passed: true, code: 'verified' });
      recordOperation('backup_content_sha256', { passed: true, code: 'verified' });
    } catch (error) {
      const code = errorCode(error, [
        'RESTORE_DISABLED', 'VERIFIED_BACKUP_NOT_CONFIGURED', 'UNVERIFIED_NOTE_BACKUP',
        'INVALID_NOTE_BACKUP', 'INVALID_BACKUP_TIME', 'NOT_VERIFIED_BEFORE_INCIDENT',
        'BACKUP_CONTENT_HASH_MISMATCH', 'RESTORE_OPERATOR_NOT_PINNED',
      ]);
      const status = code === 'RESTORE_DISABLED' || code === 'VERIFIED_BACKUP_NOT_CONFIGURED'
        || code === 'UNVERIFIED_NOTE_BACKUP' ? 503 : 503;
      recordOperation('backup_outer_sha256', { passed: false, code: code.toLowerCase() });
      return send(response, status, { error: code });
    }

    const id = requestedId(request);
    if (!id) return send(response, 400, { error: 'INVALID_NOTE_ID' });
    let snapshot;
    try { snapshot = verifyNoteBackup(inputs); }
    catch {
      recordOperation('backup_content_sha256', { passed: false, code: 'verification_failed' });
      return send(response, 503, { error: 'UNVERIFIED_NOTE_BACKUP' });
    }
    if (id !== snapshot.row.id) return send(response, 404, { error: 'NOTE_NOT_IN_BACKUP' });

    if (typeof request.headers?.origin === 'string' && request.headers.origin !== config.publicAppUrl) {
      return send(response, 403, { error: 'ORIGIN_DENIED' });
    }

    try {
      if (!runtimePromise) runtimePromise = Promise.resolve(runtimeLoader());
      const runtime = await runtimePromise;
      const identity = await runtime.verifyLoginAuthorization(request.headers?.authorization);
      if (!identity) {
        response.setHeader('WWW-Authenticate', 'Bearer');
        return send(response, 401, { error: 'UNAUTHORIZED' });
      }
      if (identity.kind !== 'student'
          || identity.userId !== env.RESTORE_B_OWNER_ID
          || identity.userId !== env.RESTORE_OPERATOR_USER_ID) {
        return send(response, 403, { error: 'RESTORE_NOT_AUTHORIZED' });
      }

      const store = noteStore(runtime.supabase);
      const common = {
        ...inputs,
        identityUserId: identity.userId,
        pinnedBOwnerId: env.RESTORE_B_OWNER_ID,
        id,
      };
      if (request.method === 'GET') {
        const current = await store.find(id);
        let plan;
        try { plan = previewNoteRestore({ ...common, current }); }
        catch (error) {
          if (error?.message === 'NOTE_OWNER_CONFLICT') return send(response, 403, { error: 'NOTE_OWNER_CONFLICT' });
          throw error;
        }
        response.setHeader('X-ALEPH-Recovery-Evidence', 'backup-plan-verified');
        return send(response, 200, plan);
      }

      const body = confirmationBody(request);
      if (!body) return send(response, 400, { error: 'INVALID_PLAN_CONFIRMATION' });
      let restored;
      try {
        restored = await restoreNoteOnce({
          ...common,
          store,
          confirmedPlanSha256: body.planSha256,
          rereadBackup: async () => ({
            raw: decodeSnapshotBase64(env.RESTORE_NOTE_SNAPSHOT_BASE64),
            trustedSha256: env.RESTORE_NOTE_BACKUP_SHA256,
          }),
        });
      } catch (error) {
        if (error?.message === 'RESTORE_NOT_AUTHORIZED' || error?.message === 'NOTE_OWNER_CONFLICT') {
          return send(response, 403, { error: error.message });
        }
        if (error?.message === 'NOTE_NOT_IN_BACKUP') return send(response, 404, { error: error.message });
        if (['UNVERIFIED_NOTE_BACKUP', 'BACKUP_CONTENT_HASH_MISMATCH',
          'NOT_VERIFIED_BEFORE_INCIDENT', 'INVALID_NOTE_BACKUP'].includes(error?.message)) {
          recordOperation('backup_outer_sha256', { passed: false, code: 'recheck_failed' });
          return send(response, 503, { error: 'UNVERIFIED_NOTE_BACKUP' });
        }
        if (error?.message === 'NOTE_PLAN_CONFIRMATION_REQUIRED') {
          recordOperation('restore_plan_confirmation', { passed: false, code: 'confirmation_mismatch' });
          return send(response, 400, { error: 'INVALID_PLAN_CONFIRMATION' });
        }
        if (error?.message === 'NOTE_CHANGED_DURING_RESTORE') return send(response, 409, { error: error.message });
        if (error?.message === 'POST_RESTORE_VERIFICATION_FAILED'
            || error?.message === 'RESTORE_TRANSACTION_NOT_VERIFIED') {
          recordOperation('restore_database_readback', { passed: false, code: 'readback_failed' });
          return send(response, 502, { error: 'POST_RESTORE_VERIFICATION_FAILED' });
        }
        throw error;
      }

      recordOperation('restore_plan_confirmation', { passed: true, code: 'confirmed' });
      recordOperation('restore_database_readback', { passed: true, code: 'verified' });
      const retests = await runLiveRetests({
        request, env, db: runtime.supabase,
        note: { id: restored.id, owner_id: restored.ownerId, title: snapshot.row.title, body: snapshot.row.body },
        fetchImpl,
      });
      recordOperation('post_restore_own_note_read', {
        passed: retests.normal.passed,
        code: retests.normal.attempted ? 'http_result' : 'not_attempted',
      });
      recordOperation('post_restore_foreign_note_denial', {
        passed: retests.forbidden.passed,
        code: retests.forbidden.attempted ? 'http_result' : 'not_attempted',
      });
      response.setHeader('X-ALEPH-Recovery-Evidence', 'configured-snapshot-rechecked-db-readback-verified');
      response.setHeader('X-ALEPH-Live-Retest', retests.passed ? 'passed' : 'not-run-or-failed');

      appendRecoveryAudit({
        ownerId: restored.ownerId,
        actorId: identity.userId,
        noteId: restored.id,
        action: 'restore_one_note',
        result: restored.status,
        backupVersion: restored.backupVersion,
        contentSha256: restored.contentSha256,
        retests: {
          normalStatus: retests.normal.status,
          normalPassed: retests.normal.passed,
          forbiddenStatus: retests.forbidden.status,
          forbiddenPassed: retests.forbidden.passed,
          passed: retests.passed,
        },
      });
      return send(response, 200, {
        id: restored.id,
        ownerVerified: true,
        contentSha256: restored.contentSha256,
        restored: restored.status === 'restored',
        restore: {
          status: restored.status,
          backupVersion: restored.backupVersion,
          backupSha256: restored.backupSha256,
          retests,
          auditRecorded: true,
          auditStorage: 'process_local_append_only',
        },
      });
    } catch (error) {
      return send(response, 502, { error: errorCode(error, [
        'NOTE_CHANGED_DURING_RESTORE', 'POST_RESTORE_VERIFICATION_FAILED',
      ]) });
    }
  };
}

export default createRestoreHandler();
