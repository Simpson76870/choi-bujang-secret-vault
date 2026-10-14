import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { B_NOTE_BACKUP_VERSION, B_NOTE_FIXTURE_KEY, SAFE_POLICY_SOURCE_COMMIT, diffPolicy, loadVerifiedPolicyBackup, noteBackupManifestSha256, noteContentSha256, policyDigest, validateBNoteBackup, validatePolicySnapshot, validatePolicyState } from '../src/restore-runtime.mjs';
import { createNoteRestoreHandler } from '../api/restore-note.js';
import { createPolicyRestoreHandler } from '../api/restore-policy.js';

const OWNER_B = '00000000-0000-4000-8000-000000000002';
const NOTE_ID = '00000000-0000-4000-8000-000000000099';
const BASELINE_CONTENT = '4단계 소유자 권한 검증에 사용하는 가상 메모입니다.';
const BASELINE_TITLE = '공개 시험 메모';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');

function responseRecorder() {
  return { statusCode: 0, payload: null, headers: {},
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function verifiedBackup(overrides = {}) {
  const row = {
    note_id: NOTE_ID, owner_id: OWNER_B, fixture_key: B_NOTE_FIXTURE_KEY,
    backup_version: B_NOTE_BACKUP_VERSION, title: BASELINE_TITLE, content: BASELINE_CONTENT,
    content_sha256: noteContentSha256(BASELINE_CONTENT), source_commit: SAFE_POLICY_SOURCE_COMMIT,
    verified_at: '2026-10-12T12:00:00.000Z', manifest_sha256: '', ...overrides,
  };
  row.manifest_sha256 = noteBackupManifestSha256(row);
  return row;
}

function memoryQuery(data) {
  const query = { select() { return this; }, eq() { return this; },
    maybeSingle: async () => ({ data, error: null }) };
  return { from: () => query, rpc: async () => ({ data: null, error: new Error('must_not_run') }) };
}

test('safe policy copy is tied to the exact pre-stage-9 source and integrity hash', async () => {
  const backup = await loadVerifiedPolicyBackup();
  assert.equal(backup.source.commit, SAFE_POLICY_SOURCE_COMMIT);
  assert.equal(backup.backupVersion, 'stage9-safe-policy-v1');
  assert.equal(backup.policy.defaultDecision, 'deny');
  assert.deepEqual(backup.policy.ruleIds, ['device_registered', 'step_up_required', 'resource_scope']);
  const raw = await read('../backups/policies/stage9-safe-policy.json');
  assert.equal(validatePolicySnapshot(raw).backupVersion, backup.backupVersion);
  assert.throws(() => validatePolicySnapshot(raw.replace('"defaultDecision": "deny"', '"defaultDecision": "allow"')), /POLICY_BACKUP_INTEGRITY_FAILED/u);
});

test('policy diff exposes only changed paths, never current policy values', async () => {
  const backup = await loadVerifiedPolicyBackup();
  const current = structuredClone(backup.policy);
  current.defaultDecision = 'allow';
  current.resources[0].permissions = ['GET'];
  const changes = diffPolicy(current, backup.policy);
  assert.deepEqual(changes, [
    { path: 'defaultDecision', change: 'changed' },
    { path: 'resources[0].permissions[1]', change: 'added' },
  ]);
  assert.equal(JSON.stringify(changes).includes('learner_fixture'), false);
  assert.notEqual(policyDigest(current), policyDigest(backup.policy));
});

test('B fixture backup must match its ID, owner, source, content and both hashes', () => {
  const backup = verifiedBackup();
  assert.doesNotThrow(() => validateBNoteBackup(backup, NOTE_ID, OWNER_B));
  assert.throws(() => validateBNoteBackup(backup, NOTE_ID, '00000000-0000-4000-8000-000000000001'), /VERIFIED_BACKUP_INVALID/u);
  assert.throws(() => validateBNoteBackup({ ...backup, content: 'tampered' }, NOTE_ID, OWNER_B), /VERIFIED_BACKUP_INVALID/u);
  assert.throws(() => validateBNoteBackup({ ...backup, manifest_sha256: '0'.repeat(64) }, NOTE_ID, OWNER_B), /VERIFIED_BACKUP_INVALID/u);
});

test('policy state with missing or mismatched checksum is rejected', async () => {
  const backup = await loadVerifiedPolicyBackup();
  const row = { version: 'test-v1', policy: backup.policy, policy_sha256: policyDigest(backup.policy) };
  assert.equal(validatePolicyState(row).version, 'test-v1');
  assert.throws(() => validatePolicyState({ ...row, policy_sha256: '0'.repeat(64) }), /TEST_POLICY_STATE_INVALID/u);
});

test('policy preview stops rather than fabricating a current test policy row', async () => {
  const handler = createPolicyRestoreHandler({
    runtimeLoader: async () => ({ verifyLoginAuthorization: async () => ({ kind: 'judge', userId: OWNER_B }), supabase: memoryQuery(null) }),
  });
  const response = responseRecorder();
  await handler({ method: 'GET', headers: { authorization: 'Bearer test' } }, response);
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.payload, { error: 'TEST_POLICY_STATE_UNAVAILABLE', backupVersion: 'stage9-safe-policy-v1', restoreExecuted: false });
});

test('B note restore stops without verified pre-incident row and never calls mutation RPC', async () => {
  let rpcCalled = false;
  const supabase = memoryQuery(null);
  supabase.rpc = async () => { rpcCalled = true; return { data: null, error: null }; };
  const handler = createNoteRestoreHandler(async () => ({ identity: { kind: 'student', userId: OWNER_B }, supabase }));
  const response = responseRecorder();
  await handler({ method: 'POST', body: { noteId: NOTE_ID, backupVersion: B_NOTE_BACKUP_VERSION } }, response);
  assert.equal(response.statusCode, 409);
  assert.equal(response.payload.error, 'VERIFIED_BACKUP_UNAVAILABLE');
  assert.equal(response.payload.restoreExecuted, false);
  assert.equal(rpcCalled, false);
});

test('Stage 10 database migration isolates test policy, backup and append-only audit tables', async () => {
  const sql = await read('../supabase/stage10-backup-restore.sql');
  assert.match(sql, /create table if not exists public\.training_test_policy_state/u);
  assert.match(sql, /create table if not exists public\.training_note_backups/u);
  assert.match(sql, /create table if not exists public\.training_test_policy_audit/u);
  assert.match(sql, /create table if not exists public\.training_note_restore_audit/u);
  assert.match(sql, /revoke update, delete, truncate on table public\.training_note_restore_audit from service_role/u);
  assert.match(sql, /revoke update, delete, truncate on table public\.training_test_policy_audit from service_role/u);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.training_notes/iu);
  assert.match(sql, /restore_stage10_training_note/u);
  assert.match(sql, /restore_stage10_test_policy/u);
});

test('README states restore routes and unavailable-backup fail-closed behavior', async () => {
  const readme = await read('../README.md');
  assert.match(readme, /GET \| `\/api\/restore-policy`/u);
  assert.match(readme, /POST \| `\/api\/restore-note`/u);
  assert.match(readme, /VERIFIED_BACKUP_UNAVAILABLE/u);
  assert.match(readme, /TEST_POLICY_STATE_UNAVAILABLE/u);
});
