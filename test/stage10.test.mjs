import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { B_NOTE_BACKUP_VERSION, B_NOTE_FIXTURE_KEY, SAFE_POLICY_SOURCE_COMMIT, diffPolicy, loadVerifiedPolicyBackup, noteBackupManifestSha256, noteContentSha256, policyDigest, validateBNoteBackup, validatePolicySnapshot, validatePolicyState } from '../src/restore-runtime.mjs';
import { createPolicyRestoreHandler } from '../api/restore-policy.js';

const OWNER_A = '00000000-0000-4000-8000-000000000001';
const OWNER_B = '00000000-0000-4000-8000-000000000002';
const FOREIGN_NOTE_ID = '00000000-0000-4000-8000-000000000098';
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

test('policy restore re-reads and re-verifies the backup immediately before mutation', async () => {
  const backup = await loadVerifiedPolicyBackup();
  const currentPolicy = structuredClone(backup.policy);
  currentPolicy.defaultDecision = 'allow';
  const current = {
    id: 'active', version: 'test-mutated-v1', policy: currentPolicy,
    policy_sha256: policyDigest(currentPolicy),
  };
  let backupReads = 0;
  let rpcCalls = 0;
  let rpcArgs = null;
  const supabase = {
    from(table) {
      assert.equal(table, 'training_test_policy_state');
      return {
        select() { return this; },
        eq(field, value) { assert.equal(field, 'id'); assert.equal(value, 'active'); return this; },
        maybeSingle: async () => ({ data: current, error: null }),
      };
    },
    rpc: async (name, args) => {
      assert.equal(name, 'restore_stage10_test_policy');
      rpcCalls += 1;
      rpcArgs = args;
      return { data: { auditRecorded: true }, error: null };
    },
  };
  const handler = createPolicyRestoreHandler({
    runtimeLoader: async () => ({
      verifyLoginAuthorization: async () => ({ kind: 'judge', userId: OWNER_B }),
      supabase,
    }),
    backupLoader: async () => {
      backupReads += 1;
      return structuredClone(backup);
    },
  });
  const response = responseRecorder();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer valid-judge' },
    body: {
      backupVersion: backup.backupVersion,
      confirm: true,
      expectedCurrentSha256: policyDigest(currentPolicy),
    },
  }, response);

  assert.equal(backupReads, 2, 'load once for the request and again immediately before mutation');
  assert.equal(rpcCalls, 1);
  assert.equal(rpcArgs.p_backup_version, backup.backupVersion);
  assert.equal(rpcArgs.p_backup_policy_sha256, policyDigest(backup.policy));
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.restored, true);
  assert.equal(response.payload.operationalPolicyTouched, false);
});

test('policy restore stops without mutation when re-reading the backup fails verification', async () => {
  const backup = await loadVerifiedPolicyBackup();
  const currentPolicy = structuredClone(backup.policy);
  currentPolicy.defaultDecision = 'allow';
  const current = {
    id: 'active', version: 'test-mutated-v1', policy: currentPolicy,
    policy_sha256: policyDigest(currentPolicy),
  };
  let backupReads = 0;
  let rpcCalls = 0;
  const supabase = {
    from() {
      return {
        select() { return this; }, eq() { return this; },
        maybeSingle: async () => ({ data: current, error: null }),
      };
    },
    rpc: async () => { rpcCalls += 1; return { data: {}, error: null }; },
  };
  const handler = createPolicyRestoreHandler({
    runtimeLoader: async () => ({
      verifyLoginAuthorization: async () => ({ kind: 'judge', userId: OWNER_B }),
      supabase,
    }),
    backupLoader: async () => {
      backupReads += 1;
      if (backupReads === 1) return structuredClone(backup);
      throw new Error('POLICY_BACKUP_INTEGRITY_FAILED');
    },
  });
  const response = responseRecorder();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer valid-judge' },
    body: {
      backupVersion: backup.backupVersion,
      confirm: true,
      expectedCurrentSha256: policyDigest(currentPolicy),
    },
  }, response);

  assert.equal(backupReads, 2);
  assert.equal(rpcCalls, 0, 'verified backup failure must stop before the mutation RPC');
  assert.equal(response.statusCode, 409);
  assert.equal(response.payload.error, 'POLICY_BACKUP_INVALID');
  assert.equal(response.payload.restoreExecuted, false);
});

test('policy restore stops when the backup changes between request reads', async () => {
  const backup = await loadVerifiedPolicyBackup();
  const changedBackup = structuredClone(backup);
  changedBackup.policy.defaultDecision = 'allow';
  const currentPolicy = structuredClone(backup.policy);
  currentPolicy.defaultDecision = 'allow';
  let backupReads = 0;
  let rpcCalls = 0;
  const supabase = {
    from() {
      return {
        select() { return this; }, eq() { return this; },
        maybeSingle: async () => ({ data: {
          id: 'active', version: 'test-mutated-v1',
          policy: currentPolicy, policy_sha256: policyDigest(currentPolicy),
        }, error: null }),
      };
    },
    rpc: async () => { rpcCalls += 1; return { data: {}, error: null }; },
  };
  const handler = createPolicyRestoreHandler({
    runtimeLoader: async () => ({
      verifyLoginAuthorization: async () => ({ kind: 'judge', userId: OWNER_B }),
      supabase,
    }),
    backupLoader: async () => (++backupReads === 1 ? structuredClone(backup) : changedBackup),
  });
  const response = responseRecorder();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer valid-judge' },
    body: {
      backupVersion: backup.backupVersion,
      confirm: true,
      expectedCurrentSha256: policyDigest(currentPolicy),
    },
  }, response);

  assert.equal(backupReads, 2);
  assert.equal(rpcCalls, 0);
  assert.equal(response.statusCode, 409);
  assert.equal(response.payload.error, 'POLICY_BACKUP_CHANGED');
  assert.equal(response.payload.restoreExecuted, false);
});

test('Stage 10 note recovery reads only environment backup and keeps audit writes out of the database', async () => {
  const api = await read('../api/restore-note.js');
  const ledger = await read('../src/recovery/ledger.mjs');
  assert.ok(api.includes('RESTORE_NOTE_SNAPSHOT_BASE64'));
  assert.ok(api.includes('RESTORE_NOTE_BACKUP_SHA256'));
  assert.ok(api.includes('RESTORE_INCIDENT_AT'));
  assert.ok(api.includes('RESTORE_B_OWNER_ID'));
  assert.ok(api.includes('RESTORE_OPERATOR_USER_ID'));
  assert.ok(!api.includes('training_note_backups'));
  assert.ok(!api.includes('training_note_restore_audit'));
  assert.ok(!api.includes('training_note_restore_retest_audit'));
  assert.ok(ledger.includes('appendRecoveryAudit'));
  assert.ok(ledger.includes('process_local_only'));
});

test('README documents environment backup, recovery route, audit and truthful operations status', async () => {
  const readme = await read('../README.md');
  assert.ok(readme.includes('RESTORE_NOTE_SNAPSHOT_BASE64'));
  assert.ok(readme.includes('RESTORE_NOTE_BACKUP_SHA256'));
  assert.ok(readme.includes('/api/restore/notes/:id'));
  assert.ok(readme.includes('/api/notes/audit'));
  assert.ok(readme.includes('/api/operations'));
  assert.ok(readme.includes('not_run'));
  assert.ok(readme.includes('npm run restore:plan'));
});
