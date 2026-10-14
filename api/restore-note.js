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

export function createNoteRestoreHandler(authenticate = authenticateStudent) {
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
      return send(response, 200, {
        action: 'restore_one_private_virtual_note',
        restored: true,
        id: data.noteId,
        ownerId: data.ownerId,
        contentSha256: data.contentSha256,
        backupVersion: data.backupVersion,
        auditRecorded: true,
      });
    } catch {
      return send(response, 503, { error: 'RESTORE_VERIFICATION_FAILED', restoreExecuted: false });
    }
  };
}

export default createNoteRestoreHandler();
