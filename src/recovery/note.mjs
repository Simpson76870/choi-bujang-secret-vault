import { createHash, timingSafeEqual } from 'node:crypto';
import { noteBackupManifestSha256, validateBNoteBackup } from '../restore-runtime.mjs';

const HEX = /^[a-f0-9]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const fail = code => { throw new Error(code); };

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function constantTimeHexEqual(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string'
      || !HEX.test(actual) || !HEX.test(expected)) return false;
  const left = Buffer.from(actual, 'hex');
  const right = Buffer.from(expected, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function timestamp(value) {
  if (typeof value !== 'string' || !TIME.test(value)) fail('INVALID_BACKUP_TIME');
  const parsed = Date.parse(value);
  const normalized = value.includes('.') ? value : value.slice(0, -1) + '.000Z';
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== normalized) {
    fail('INVALID_BACKUP_TIME');
  }
  return parsed;
}

function validText(value, max) {
  return typeof value === 'string' && value.length > 0 && value.length <= max
    && value.trim().length > 0;
}

// This is the content digest defined by the Stage 10 backup contract.
// It includes the memo ID and verified owner, not merely the visible body.
export function contentSha256(note) {
  const body = typeof note === 'string' ? note : note?.body ?? note?.content;
  if (typeof body !== 'string') fail('NOTE_BACKUP_CONTENT_INVALID');
  return sha256(body);
}

function noteRecordSha256(note) {
  return sha256(JSON.stringify({
    id: note.id,
    owner_id: note.owner_id,
    title: note.title,
    body: note.body,
  }));
}

export function decodeSnapshotBase64(value) {
  if (typeof value !== 'string' || value.length > 32768) return null;

  // Some isolated runners provide the exact JSON string, while others provide
  // its base64 encoding. Return raw JSON byte-for-byte so the outer SHA-256
  // is always checked against the value the runner actually supplied.
  if (value.trimStart().startsWith('{')) return value;
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(value) || value.length % 4 !== 0) return null;
  try {
    const bytes = Buffer.from(value, 'base64');
    return bytes.toString('base64') === value ? bytes.toString('utf8') : null;
  } catch {
    return null;
  }
}

export function verifyNoteBackup({
  raw, trustedSha256, snapshotSource, incidentAt, pinnedBOwnerId,
}) {
  if (typeof raw !== 'string' || raw.length > 32768
      || typeof trustedSha256 !== 'string') fail('UNVERIFIED_NOTE_BACKUP');

  const rawHashMatches = constantTimeHexEqual(sha256(raw), trustedSha256);
  const sourceHashMatches = typeof snapshotSource === 'string'
    ? constantTimeHexEqual(sha256(snapshotSource), trustedSha256) : false;
  if (!rawHashMatches && !sourceHashMatches) fail('UNVERIFIED_NOTE_BACKUP');

  let snapshot;
  try { snapshot = JSON.parse(raw); } catch { fail('INVALID_NOTE_BACKUP'); }
  const expectedKeys =
    'backup_version,content,content_sha256,fixture_key,manifest_sha256,note_id,owner_id,source_commit,title,verified_at';
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
      || Object.keys(snapshot).sort().join(',') !== expectedKeys) {
    fail('INVALID_NOTE_BACKUP');
  }
  if (!constantTimeHexEqual(sha256(snapshot.content ?? ''), snapshot.content_sha256)) {
    fail('BACKUP_CONTENT_HASH_MISMATCH');
  }
  if (!constantTimeHexEqual(noteBackupManifestSha256(snapshot), snapshot.manifest_sha256)) {
    fail('BACKUP_MANIFEST_HASH_MISMATCH');
  }

  let verified;
  try { verified = validateBNoteBackup(snapshot, snapshot.note_id, pinnedBOwnerId); }
  catch { fail('INVALID_NOTE_BACKUP'); }

  if (!incidentAt || timestamp(verified.verified_at) >= timestamp(incidentAt)) {
    fail('NOT_VERIFIED_BEFORE_INCIDENT');
  }
  const row = {
    id: verified.note_id,
    owner_id: verified.owner_id,
    title: verified.title,
    body: verified.content,
  };
  return {
    item: { version: verified.backup_version, contentSha256: verified.content_sha256 },
    row,
    trustedSha256,
    snapshotSource,
  };
}
function presentRow(row) {
  return row == null ? null : {
    id: row.id,
    owner_id: row.owner_id,
    title: row.title,
    body: row.content ?? row.body,
  };
}

export function previewNoteRestore({
  raw, trustedSha256, snapshotSource, incidentAt, pinnedBOwnerId, identityUserId, id, current,
}) {
  const verified = verifyNoteBackup({ raw, trustedSha256, snapshotSource, incidentAt, pinnedBOwnerId });
  if (!UUID.test(id ?? '') || id !== verified.row.id) fail('NOTE_NOT_IN_BACKUP');
  if (!UUID.test(identityUserId ?? '') || identityUserId !== pinnedBOwnerId) {
    fail('RESTORE_NOT_AUTHORIZED');
  }

  const existing = presentRow(current);
  if (existing && (existing.id !== id || existing.owner_id !== pinnedBOwnerId)) {
    fail('NOTE_OWNER_CONFLICT');
  }
  const beforeSha256 = existing ? noteRecordSha256(existing) : null;
  const status = !existing ? 'insert'
    : existing.title === verified.row.title
      && constantTimeHexEqual(contentSha256(existing), verified.item.contentSha256)
      ? 'already_restored' : 'replace';
  const changedFields = existing === null
    ? ['id', 'owner_id', 'title', 'body']
    : ['title', 'body'].filter(field => existing[field] !== verified.row[field]);
  const planSha256 = sha256(JSON.stringify({
    snapshotSha256: trustedSha256,
    id,
    ownerId: pinnedBOwnerId,
    beforeSha256,
    afterSha256: verified.item.contentSha256,
    status,
  }));

  return {
    schema: 'aleph.recovery.note-preview.v1',
    id,
    ownerId: pinnedBOwnerId,
    beforeSha256,
    contentSha256: verified.item.contentSha256,
    backupSha256: trustedSha256,
    backupVersion: verified.item.version,
    changedFields,
    planSha256,
    status,
  };
}

export async function restoreNoteOnce({
  store, raw, trustedSha256, snapshotSource, incidentAt, pinnedBOwnerId,
  identityUserId, id, confirmedPlanSha256, rereadBackup,
}) {
  if (!store || typeof store.find !== 'function'
      || typeof store.restoreVerified !== 'function') fail('RESTORE_BACKEND_UNAVAILABLE');

  const current = await store.find(id);
  const preview = previewNoteRestore({
    raw, trustedSha256, snapshotSource, incidentAt, pinnedBOwnerId, identityUserId, id, current,
  });
  // Direct Stage 10 restore is authorized by the verified token and private
  // environment snapshot, not by caller-provided body fields. Keep optional
  // plan binding for internal callers only.
  if (confirmedPlanSha256 !== undefined
      && !constantTimeHexEqual(preview.planSha256, confirmedPlanSha256)) {
    fail('NOTE_PLAN_CONFIRMATION_REQUIRED');
  }

  // Always reread and verify the independent environment snapshot immediately
  // before applying, not just the copy that was used to create the preview.
  if (typeof rereadBackup !== 'function') fail('UNVERIFIED_NOTE_BACKUP');
  let fresh;
  try { fresh = await rereadBackup(); } catch (error) {
    if (error?.message === 'POLICY_SCOPE_UNVERIFIED') fail('POLICY_SCOPE_UNVERIFIED');
    fail('UNVERIFIED_NOTE_BACKUP');
  }
  if (!fresh || fresh.raw !== raw || fresh.trustedSha256 !== trustedSha256
      || (snapshotSource !== undefined && fresh.snapshotSource !== snapshotSource)) {
    fail('UNVERIFIED_NOTE_BACKUP');
  }
  const verifiedFresh = verifyNoteBackup({
    raw: fresh.raw, trustedSha256: fresh.trustedSha256,
    snapshotSource: fresh.snapshotSource, incidentAt, pinnedBOwnerId,
  });

  if (preview.status !== 'already_restored') {
    const saved = await store.restoreVerified(verifiedFresh.row, current);
    if (saved?.transactionalReadbackVerified !== true || saved?.id !== verifiedFresh.row.id) {
      fail('RESTORE_TRANSACTION_NOT_VERIFIED');
    }
    return {
      id,
      ownerId: pinnedBOwnerId,
      contentSha256: preview.contentSha256,
      status: 'restored',
      backupVersion: preview.backupVersion,
      backupSha256: preview.backupSha256,
    };
  }

  const after = await store.find(id);
  if (!after || after.owner_id !== pinnedBOwnerId
      || !constantTimeHexEqual(contentSha256(presentRow(after)), verifiedFresh.item.contentSha256)) {
    fail('POST_RESTORE_VERIFICATION_FAILED');
  }
  return {
    id,
    ownerId: pinnedBOwnerId,
    contentSha256: preview.contentSha256,
    status: 'unchanged',
    backupVersion: preview.backupVersion,
    backupSha256: preview.backupSha256,
  };
}
