import { authenticateStudent } from '../src/notes-runtime.mjs';
import {
  B_NOTE_BACKUP_VERSION, B_NOTE_FIXTURE_KEY, noteContentSha256, validateBNoteBackup,
} from '../src/restore-runtime.mjs';

function send(response, status, payload) {
  return response.status(status).json(payload);
}

function bodyObject(request) {
  if (request.body && typeof request.body === 'object' && !Array.isArray(request.body)) return request.body;
  if (typeof request.body === 'string') {
    try {
      const value = JSON.parse(request.body);
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch { return null; }
  }
  return null;
}


export async function runPostRestoreRetests({
  supabase, publicAppUrl, authorization, noteId, ownerId, title, content, fetchImpl = fetch,
} = {}) {
  const result = {
    executed: false,
    normal: { target: 'own_restored_note', method: 'GET', status: null, attempted: false, passed: false },
    forbidden: { target: 'other_owner_note', method: 'GET', status: null, attempted: false, passed: false },
    passed: false,
  };

  let base;
  try { base = new URL(publicAppUrl); } catch { return result; }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash
      || typeof authorization !== 'string' || !/^Bearer\s+\S+/u.test(authorization)
      || typeof fetchImpl !== 'function') return result;

  let foreignId = '';
  try {
    const { data, error } = await supabase.from('training_notes')
      .select('id,owner_id').neq('owner_id', ownerId).limit(1).maybeSingle();
    if (!error && data && data.owner_id !== ownerId
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(data.id)
        && data.id !== noteId) foreignId = data.id;
  } catch { /* A missing foreign fixture is recorded as a skipped negative retest. */ }

  const headers = { authorization, accept: 'application/json' };
  const timeoutSignal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(7000) : undefined;
  const call = async path => {
    const url = new URL(path, base);
    const options = { method: 'GET', headers, cache: 'no-store' };
    if (timeoutSignal) options.signal = timeoutSignal;
    try {
      const response = await fetchImpl(url, options);
      let payload = null;
      try { payload = await response.json(); } catch { /* Non-JSON is a failed retest. */ }
      return { status: response.status, payload };
    } catch {
      return { status: null, payload: null };
    }
  };

  result.normal.attempted = true;
  const normal = await call('/api/notes/' + noteId);
  result.normal.status = normal.status;
  result.normal.passed = normal.status === 200
    && normal.payload?.id === noteId
    && normal.payload?.title === title
    && normal.payload?.body === content;

  if (foreignId) {
    result.forbidden.attempted = true;
    const forbidden = await call('/api/notes/' + foreignId);
    result.forbidden.status = forbidden.status;
    result.forbidden.passed = forbidden.status === 404
      && forbidden.payload?.error === 'NOTE_NOT_FOUND';
  }

  result.executed = result.normal.attempted && result.forbidden.attempted;
  result.passed = result.executed && result.normal.passed && result.forbidden.passed;
  return result;
}

export function createNoteRestoreHandler(authenticate = authenticateStudent, { fetchImpl = fetch } = {}) {
  return async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    }

    const context = await authenticate(request, response);
    if (!context) return;

    const input = bodyObject(request);
    if (!input || Object.keys(input).sort().join(',') !== 'backupVersion,noteId'
        || typeof input.noteId !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(input.noteId)
        || input.backupVersion !== B_NOTE_BACKUP_VERSION) {
      return send(response, 400, { error: 'INVALID_RESTORE_REQUEST' });
    }

    let snapshot;
    try {
      const { data, error } = await context.supabase.from('training_note_backups')
        .select('note_id,owner_id,title,content,content_sha256,manifest_sha256,backup_version,fixture_key,source_commit,verified_at')
        .eq('note_id', input.noteId)
        .eq('owner_id', context.identity.userId)
        .eq('fixture_key', B_NOTE_FIXTURE_KEY)
        .eq('backup_version', B_NOTE_BACKUP_VERSION)
        .maybeSingle();
      if (error) return send(response, 503, { error: 'BACKUP_STORE_UNAVAILABLE' });
      if (!data) return send(response, 409, { error: 'VERIFIED_BACKUP_UNAVAILABLE', restoreExecuted: false });
      snapshot = validateBNoteBackup(data, input.noteId, context.identity.userId);
    } catch (error) {
      if (error?.message === 'VERIFIED_BACKUP_INVALID') {
        return send(response, 409, { error: 'VERIFIED_BACKUP_INVALID', restoreExecuted: false });
      }
      return send(response, 503, { error: 'BACKUP_STORE_UNAVAILABLE' });
    }

    const hash = noteContentSha256(snapshot.content);
    if (hash !== snapshot.content_sha256) {
      return send(response, 409, { error: 'VERIFIED_BACKUP_INVALID', restoreExecuted: false });
    }

    try {
      const { data, error } = await context.supabase.rpc('restore_stage10_training_note', {
        p_note_id: snapshot.note_id,
        p_owner_id: snapshot.owner_id,
        p_actor_id: context.identity.userId,
        p_backup_version: snapshot.backup_version,
        p_title: snapshot.title,
        p_content: snapshot.content,
        p_content_sha256: snapshot.content_sha256,
      });
      if (error || !data
          || data.noteId !== snapshot.note_id
          || data.ownerId !== snapshot.owner_id
          || data.contentSha256 !== snapshot.content_sha256
          || data.backupVersion !== snapshot.backup_version) {
        return send(response, 503, { error: 'RESTORE_VERIFICATION_FAILED', restoreExecuted: false });
      }
      const postRestoreRetest = await runPostRestoreRetests({
        supabase: context.supabase,
        publicAppUrl: context.config?.publicAppUrl,
        authorization: request.headers?.authorization,
        noteId: snapshot.note_id,
        ownerId: snapshot.owner_id,
        title: snapshot.title,
        content: snapshot.content,
        fetchImpl,
      });

      let postRestoreRetestAuditRecorded = false;
      try {
        const { error: auditError } = await context.supabase.from('training_note_restore_retest_audit').insert({
          actor_id: context.identity.userId,
          note_id: snapshot.note_id,
          backup_version: snapshot.backup_version,
          normal_attempted: postRestoreRetest.normal.attempted,
          normal_status: postRestoreRetest.normal.status,
          normal_passed: postRestoreRetest.normal.passed,
          forbidden_attempted: postRestoreRetest.forbidden.attempted,
          forbidden_status: postRestoreRetest.forbidden.status,
          forbidden_passed: postRestoreRetest.forbidden.passed,
          retest_passed: postRestoreRetest.passed,
        });
        postRestoreRetestAuditRecorded = !auditError;
      } catch { postRestoreRetestAuditRecorded = false; }

      return send(response, 200, {
        action: 'restore_one_private_virtual_note',
        restored: true,
        id: data.noteId,
        ownerId: data.ownerId,
        contentSha256: data.contentSha256,
        backupVersion: data.backupVersion,
        auditRecorded: true,
        postRestoreRetest,
        postRestoreRetestAuditRecorded,
      });
    } catch {
      return send(response, 503, { error: 'RESTORE_VERIFICATION_FAILED', restoreExecuted: false });
    }
  };
}

export default createNoteRestoreHandler();
