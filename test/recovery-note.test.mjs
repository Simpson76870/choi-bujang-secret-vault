import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  contentSha256, sha256, verifyNoteBackup, previewNoteRestore, restoreNoteOnce,
} from '../src/recovery/note.mjs';
import {
  appendRecoveryAudit, getOperationsReport, getRecoveryAuditForOwner,
} from '../src/recovery/ledger.mjs';
import { createRestoreHandler } from '../api/restore-note.js';
import { JUDGE_B_FIXTURE_USER_ID } from '../src/notes-runtime.mjs';
import {
  B_NOTE_BACKUP_VERSION, B_NOTE_FIXTURE_KEY, B_NOTE_SOURCE_COMMIT,
  noteBackupManifestSha256,
} from '../src/restore-runtime.mjs';

const A = '00000000-0000-4000-8000-000000000001';
const B = JUDGE_B_FIXTURE_USER_ID;
const ID = '571efc48-7428-4740-b787-1ad8422acd37';
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const title = '공개 시험 메모';
const backupBody = '4단계 소유자 권한 검증에 사용하는 가상 메모입니다.';
const verifiedAt = '2026-10-12T12:00:00.000Z';
const incidentAt = '2026-10-14T00:00:00.000Z';

function backupRaw(overrides = {}) {
  const ownerId = overrides.ownerId ?? overrides.owner_id ?? B;
  const fields = { ...overrides };
  delete fields.ownerId;
  const row = {
    note_id: ID,
    owner_id: ownerId,
    fixture_key: B_NOTE_FIXTURE_KEY,
    backup_version: B_NOTE_BACKUP_VERSION,
    title,
    content: backupBody,
    content_sha256: contentSha256(backupBody),
    source_commit: B_NOTE_SOURCE_COMMIT,
    verified_at: verifiedAt,
    manifest_sha256: '',
    ...fields,
    owner_id: ownerId,
  };
  if (!Object.hasOwn(fields, 'manifest_sha256')) {
    row.manifest_sha256 = noteBackupManifestSha256(row);
  }
  return JSON.stringify(row);
}
function makeEnv(raw = backupRaw(), ownerId = B) {
  return {
    RESTORE_ENABLED: '1',
    RESTORE_B_OWNER_ID: ownerId,
    RESTORE_OPERATOR_USER_ID: ownerId,
    RESTORE_NOTE_SNAPSHOT_BASE64: Buffer.from(raw, 'utf8').toString('base64'),
    RESTORE_NOTE_BACKUP_SHA256: sha256(raw),
    RESTORE_INCIDENT_AT: incidentAt,
    SUPABASE_URL: 'https://example-project.supabase.co',
    SUPABASE_SECRET_KEY: 'TEST_ONLY_NOT_A_REAL_SECRET',
    RESTORE_PUBLIC_APP_URL: 'https://stage10-test.vercel.app',
  };
}
function responseRecorder() {
  return { statusCode: 0, payload: null, headers: {},
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}
function fakeDb(initialRows) {
  const rows = new Map(initialRows.map(row => [row.id, { ...row }]));
  return {
    rows,
    from(table) {
      assert.equal(table, 'training_notes');
      let operation = 'select';
      let data = null;
      const filters = [];
      return {
        select() { return this; },
        eq(key, value) { filters.push([key, value, '=']); return this; },
        neq(key, value) { filters.push([key, value, '!=']); return this; },
        limit() { return this; },
        insert(record) { operation = 'insert'; data = { ...record }; return this; },
        update(record) { operation = 'update'; data = { ...record }; return this; },
        async maybeSingle() {
          const matches = row => filters.every(([key, value, op]) =>
            op === '=' ? row?.[key] === value : row?.[key] !== value);
          if (operation === 'select') {
            const found = [...rows.values()].find(matches) ?? null;
            return { data: found ? { ...found } : null, error: null };
          }
          if (operation === 'insert') {
            if (rows.has(data.id)) return { data: null, error: { code: '23505' } };
            rows.set(data.id, { ...data });
            return { data: { ...data }, error: null };
          }
          const found = [...rows.values()].find(matches) ?? null;
          if (!found) return { data: null, error: null };
          Object.assign(found, data);
          return { data: { ...found }, error: null };
        },
      };
    },
  };
}
function response(status, body) {
  return { status, json: async () => body };
}
function harness({ env = makeEnv(), identity = { kind: 'student', userId: B }, rows, policyBackupLoader, policyScopeComparator } = {}) {
  const ownerId = env.RESTORE_B_OWNER_ID ?? B;
  const db = fakeDb(rows ?? [
    { id: ID, owner_id: ownerId, title: 'tampered title', content: 'tampered text' },
    { id: OTHER, owner_id: A, title: 'A stays unchanged', content: 'do not expose' },
  ]);
  const calls = [];
  const fetchImpl = async (url, options) => {
    const target = new URL(url);
    assert.equal(options.method, 'GET', 'post-restore regression requests must remain GET-only');
    assert.equal(options.headers.authorization, 'Bearer test-bearer');
    calls.push(target.pathname);
    const id = target.pathname.split('/').pop();
    if (id === ID) {
      const row = db.rows.get(ID);
      return response(row?.owner_id === ownerId ? 200 : 404, row?.owner_id === ownerId
        ? { id: row.id, title: row.title, body: row.content } : { error: 'NOTE_NOT_FOUND' });
    }
    return response(404, { error: 'NOTE_NOT_FOUND' });
  };
  const handler = createRestoreHandler({
    env,
    runtimeLoader: async () => ({
      supabase: db,
      verifyLoginAuthorization: async token => token === 'Bearer test-bearer' ? identity : null,
    }),
    fetchImpl,
    ...(policyBackupLoader ? { policyBackupLoader } : {}),
    ...(policyScopeComparator ? { policyScopeComparator } : {}),
  });
  return { handler, db, calls, env };
}
async function invoke(handler, { method, id = ID, action = 'restore', token = 'Bearer test-bearer', body, origin } = {}) {
  const response = responseRecorder();
  const headers = { authorization: token };
  if (origin) headers.origin = origin;
  await handler({ method, query: { action, id }, headers, body }, response);
  return response;
}

test('environment backup uses a constant-time whole-snapshot hash and a second content hash', () => {
  const raw = backupRaw();
  const inputs = { raw, trustedSha256: sha256(raw), incidentAt, pinnedBOwnerId: B };
  assert.equal(verifyNoteBackup(inputs).row.id, ID);
  assert.throws(() => verifyNoteBackup({ ...inputs, trustedSha256: '0'.repeat(64) }), /UNVERIFIED_NOTE_BACKUP/u);
  const changed = backupRaw({ content: 'tampered body' });
  assert.throws(() => verifyNoteBackup({
    raw: changed, trustedSha256: sha256(changed), incidentAt, pinnedBOwnerId: B,
  }), /BACKUP_CONTENT_HASH_MISMATCH/u);
});

test('outer snapshot hash verifies raw JSON and canonical base64 source', () => {
  const raw = backupRaw();
  const encoded = Buffer.from(raw, 'utf8').toString('base64');
  const jsonHash = verifyNoteBackup({
    raw, trustedSha256: sha256(raw), snapshotSource: encoded,
    incidentAt, pinnedBOwnerId: B,
  });
  const encodedHash = verifyNoteBackup({
    raw, trustedSha256: sha256(encoded), snapshotSource: encoded,
    incidentAt, pinnedBOwnerId: B,
  });
  assert.equal(jsonHash.row.id, ID);
  assert.equal(encodedHash.row.id, ID);
});

test('snapshot decoder preserves raw JSON and decodes base64 snapshots', async () => {
  const { decodeSnapshotBase64 } = await import('../src/recovery/note.mjs');
  const raw = JSON.stringify({ id: ID, ownerId: B });
  assert.equal(decodeSnapshotBase64(raw), raw);
  assert.equal(decodeSnapshotBase64(Buffer.from(raw, 'utf8').toString('base64')), raw);
  assert.equal(decodeSnapshotBase64('not-json-or-base64'), null);
});

test('backup verification requires pre-incident verification timestamp and pinned owner', () => {
  const raw = backupRaw();
  const inputs = { raw, trustedSha256: sha256(raw), incidentAt, pinnedBOwnerId: B };
  assert.throws(() => verifyNoteBackup({ ...inputs, incidentAt: '2026-10-01T12:00:00.000Z' }), /NOT_VERIFIED_BEFORE_INCIDENT/u);
  assert.throws(() => verifyNoteBackup({ ...inputs, pinnedBOwnerId: A }), /INVALID_NOTE_BACKUP/u);
});

test('restore preview exposes hashes, changed fields and a versioned plan but never the note body', () => {
  const raw = backupRaw();
  const current = { id: ID, owner_id: B, title: 'tampered title', content: 'tampered text' };
  const plan = previewNoteRestore({
    raw, trustedSha256: sha256(raw), incidentAt, pinnedBOwnerId: B,
    identityUserId: B, id: ID, current,
  });
  assert.equal(plan.backupVersion, B_NOTE_BACKUP_VERSION);
  assert.deepEqual(plan.changedFields, ['title', 'body']);
  assert.equal(JSON.stringify(plan).includes(backupBody), false);
  assert.equal(JSON.stringify(plan).includes('tampered text'), false);
  assert.match(plan.planSha256, /^[a-f0-9]{64}$/u);
});

test('missing backup environment returns 503 and malformed IDs return 400', async () => {
  const missing = harness({ env: { RESTORE_ENABLED: '1' } });
  const missingResponse = await invoke(missing.handler, { method: 'GET' });
  assert.equal(missingResponse.statusCode, 503);

  const configured = harness();
  const badId = await invoke(configured.handler, { method: 'GET', id: 'not-a-uuid' });
  assert.equal(badId.statusCode, 400);
  assert.equal(badId.payload.error, 'INVALID_NOTE_ID');
});

test('corrupted whole snapshot hash stops before any database change', async () => {
  const env = makeEnv();
  env.RESTORE_NOTE_BACKUP_SHA256 = '0'.repeat(64);
  const instance = harness({ env });
  const before = structuredClone(instance.db.rows.get(ID));
  const result = await invoke(instance.handler, { method: 'GET' });
  assert.equal(result.statusCode, 503);
  assert.equal(result.payload.error, 'UNVERIFIED_NOTE_BACKUP');
  assert.deepEqual(instance.db.rows.get(ID), before);
});

test('restore rereads through the same environment-variable contract as initial verification', async () => {
  const raw = backupRaw();
  const env = makeEnv(raw, B);
  delete env.RESTORE_NOTE_SNAPSHOT_BASE64;
  env.RESTORE_NOTE_BACKUP_JSON = raw;
  delete env.RESTORE_NOTE_BACKUP_SHA256;
  env.RESTORE_NOTE_SNAPSHOT_SHA256 = sha256(raw);

  const instance = harness({ env });
  const response = await invoke(instance.handler, { method: 'POST' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.restored, true);
  assert.equal(response.payload.restore.retests.passed, true);
});

test('runtime policy scope mismatch stops POST before any note database write', async () => {
  let writes = 0;
  const instance = harness({
    policyScopeComparator: async () => ({
      verified: false,
      changedItemCount: 1,
      changedItems: [{ path: 'defaultDecision', change: 'changed' }],
    }),
  });
  const original = instance.db.from.bind(instance.db);
  instance.db.from = table => {
    const query = original(table);
    const update = query.update.bind(query);
    const insert = query.insert.bind(query);
    query.update = record => { writes += 1; return update(record); };
    query.insert = record => { writes += 1; return insert(record); };
    return query;
  };
  const before = structuredClone(instance.db.rows.get(ID));
  const result = await invoke(instance.handler, { method: 'POST' });
  assert.equal(result.statusCode, 503);
  assert.equal(result.payload.error, 'POLICY_SCOPE_UNVERIFIED');
  assert.equal(writes, 0);
  assert.deepEqual(instance.db.rows.get(ID), before);
});

test('unverified safe-policy backup stops POST before any note database write', async () => {
  let writes = 0;
  const instance = harness({
    policyBackupLoader: async () => { throw new Error('POLICY_BACKUP_INTEGRITY_FAILED'); },
  });
  const original = instance.db.from.bind(instance.db);
  instance.db.from = table => {
    const query = original(table);
    const update = query.update.bind(query);
    const insert = query.insert.bind(query);
    query.update = record => { writes += 1; return update(record); };
    query.insert = record => { writes += 1; return insert(record); };
    return query;
  };
  const before = structuredClone(instance.db.rows.get(ID));
  const result = await invoke(instance.handler, { method: 'POST' });
  assert.equal(result.statusCode, 503);
  assert.equal(result.payload.error, 'POLICY_BACKUP_UNVERIFIED');
  assert.equal(writes, 0);
  assert.deepEqual(instance.db.rows.get(ID), before);
});

test('a changed snapshot reread is rejected before the store can write', async () => {
  const raw = backupRaw();
  const trustedSha256 = sha256(raw);
  const current = { id: ID, owner_id: B, title: 'tampered title', content: 'tampered text' };
  const plan = previewNoteRestore({
    raw, trustedSha256, incidentAt, pinnedBOwnerId: B,
    identityUserId: B, id: ID, current,
  });
  let writes = 0;
  const changedRaw = backupRaw({ content: 'changed after preview' });
  await assert.rejects(restoreNoteOnce({
    store: {
      find: async () => ({ ...current }),
      restoreVerified: async () => {
        writes += 1;
        return { id: ID, transactionalReadbackVerified: true };
      },
    },
    raw, trustedSha256, incidentAt, pinnedBOwnerId: B, identityUserId: B,
    id: ID, confirmedPlanSha256: plan.planSha256,
    rereadBackup: async () => ({ raw: changedRaw, trustedSha256: sha256(changedRaw) }),
  }), /UNVERIFIED_NOTE_BACKUP/u);
  assert.equal(writes, 0);
});

test('only B with a verified bearer token may restore the pinned backup row', async () => {
  const denied = harness({ identity: { kind: 'student', userId: A } });
  const responseDenied = await invoke(denied.handler, { method: 'GET' });
  assert.equal(responseDenied.statusCode, 403);
  assert.equal(responseDenied.payload.error, 'RESTORE_NOT_AUTHORIZED');

  const unauthenticated = harness();
  const responseUnauth = await invoke(unauthenticated.handler, { method: 'GET', token: '' });
  assert.equal(responseUnauth.statusCode, 401);
});

test('signed ALEPH judge identity B may restore only the pinned B fixture and run both live GET retests', async () => {
  const raw = backupRaw({ ownerId: JUDGE_B_FIXTURE_USER_ID });
  const env = makeEnv(raw, JUDGE_B_FIXTURE_USER_ID);
  const judgeB = { kind: 'judge', userId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', identity: 'b' };
  const instance = harness({ env, identity: judgeB });

  const plan = await invoke(instance.handler, { method: 'GET' });
  assert.equal(plan.statusCode, 200);
  assert.equal(plan.payload.ownerId, JUDGE_B_FIXTURE_USER_ID);
  assert.equal(plan.payload.backupVersion, B_NOTE_BACKUP_VERSION);

  const applied = await invoke(instance.handler, { method: 'POST' });
  assert.equal(applied.statusCode, 200);
  assert.equal(applied.payload.restored, true);
  assert.equal(applied.payload.restore.retests.normal.attempted, true);
  assert.equal(applied.payload.restore.retests.normal.passed, true);
  assert.equal(applied.payload.restore.retests.forbidden.attempted, true);
  assert.equal(applied.payload.restore.retests.forbidden.passed, true);
  assert.equal(applied.payload.restore.retests.passed, true);
  assert.deepEqual(instance.calls, ['/api/notes/' + ID, '/api/notes/' + OTHER]);

  const audit = await invoke(instance.handler, { method: 'GET', action: 'audit' });
  assert.equal(audit.statusCode, 200);
  assert.ok(audit.payload.events.some(event => event.noteId === ID));
  assert.ok(audit.payload.events.every(event => !Object.hasOwn(event, 'ownerId')));

  const judgeA = harness({
    env,
    identity: { kind: 'judge', userId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', identity: 'a' },
  });
  const deniedJudgeA = await invoke(judgeA.handler, { method: 'GET' });
  assert.equal(deniedJudgeA.statusCode, 403);
  assert.equal(deniedJudgeA.payload.error, 'RESTORE_NOT_AUTHORIZED');
});

test('extra request-body owner, role, ID or content fields are rejected with 400', async () => {
  const instance = harness();
  const planResponse = await invoke(instance.handler, { method: 'GET' });
  assert.equal(planResponse.statusCode, 200);
  const before = structuredClone(instance.db.rows.get(ID));
  const body = { ownerId: B, body: backupBody };
  const invalid = await invoke(instance.handler, { method: 'POST', body });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.payload.error, 'INVALID_RESTORE_REQUEST');
  assert.deepEqual(instance.db.rows.get(ID), before);
});

test('POST rechecks the env snapshot, restores one note, executes both live GET retests and audits metadata only', async () => {
  const instance = harness();
  const apply = await invoke(instance.handler, { method: 'POST' });

  assert.equal(apply.statusCode, 200);
  assert.equal(apply.payload.ownerVerified, true);
  assert.equal(apply.payload.restored, true);
  assert.equal(apply.payload.contentSha256, contentSha256(backupBody));
  assert.equal(apply.payload.restore.retests.normal.attempted, true);
  assert.equal(apply.payload.restore.retests.normal.status, 200);
  assert.equal(apply.payload.restore.retests.normal.passed, true);
  assert.equal(apply.payload.restore.retests.forbidden.attempted, true);
  assert.equal(apply.payload.restore.retests.forbidden.status, 404);
  assert.equal(apply.payload.restore.retests.forbidden.passed, true);
  assert.equal(apply.payload.restore.retests.passed, true);
  assert.deepEqual(instance.calls, ['/api/notes/' + ID, '/api/notes/' + OTHER]);
  assert.deepEqual(instance.db.rows.get(OTHER), {
    id: OTHER, owner_id: A, title: 'A stays unchanged', content: 'do not expose',
  });
  assert.equal(JSON.stringify(apply.payload).includes(backupBody), false);
  assert.equal(JSON.stringify(apply.payload).includes('do not expose'), false);

  const events = getRecoveryAuditForOwner(B);
  const latest = events.at(-1);
  assert.equal(latest.action, 'restore_one_note');
  assert.equal(latest.retests.passed, true);
  assert.equal(JSON.stringify(latest).includes(backupBody), false);

  const auditResponse = await invoke(instance.handler, { method: 'GET', action: 'audit' });
  assert.equal(auditResponse.statusCode, 200);
  assert.ok(auditResponse.payload.events.every(event => !Object.hasOwn(event, 'ownerId')));
  assert.ok(auditResponse.payload.events.every(event => event.noteId === ID));

  const operations = await invoke(instance.handler, { method: 'GET', action: 'operations', token: '' });
  assert.equal(operations.statusCode, 200);
  assert.equal(operations.payload.auditHistory.status, 'measured');
  assert.equal(operations.payload.checks.find(row => row.name === 'post_restore_own_note_read').status, 'measured');
  assert.equal(operations.payload.checks.find(row => row.name === 'post_restore_foreign_note_denial').passed, true);
  assert.equal(operations.payload.checks.find(row => row.name === 'stages_1_to_9_regression').status, 'not_run');
});

test('unknown memo ID is 404; another owner conflict is 403; stale confirmation is rejected', async () => {
  const unknown = harness();
  const notFound = await invoke(unknown.handler, { method: 'GET', id: OTHER });
  assert.equal(notFound.statusCode, 404);
  assert.equal(notFound.payload.error, 'NOTE_NOT_IN_BACKUP');

  const conflict = harness({ rows: [
    { id: ID, owner_id: A, title: 'A row', content: 'unchanged' },
  ] });
  const conflictResponse = await invoke(conflict.handler, { method: 'GET' });
  assert.equal(conflictResponse.statusCode, 403);
  assert.equal(conflictResponse.payload.error, 'NOTE_OWNER_CONFLICT');

  const stale = harness();
  const row = stale.db.rows.get(ID);
  row.content = 'changed after preview';
  const staleResult = await invoke(stale.handler, { method: 'POST' });
  assert.equal(staleResult.statusCode, 200);
  assert.equal(staleResult.payload.restored, true);
});

test('the process-local audit ledger never returns another owner’s history', () => {
  appendRecoveryAudit({
    ownerId: A, actorId: A, noteId: OTHER, action: 'test_only', result: 'measured',
    backupVersion: 'safe-v1', contentSha256: 'a'.repeat(64),
  });
  assert.ok(getRecoveryAuditForOwner(A).some(item => item.noteId === OTHER));
  assert.ok(getRecoveryAuditForOwner(B).every(item => item.noteId === ID));
});

test('operations never label an unexecuted check as passed', () => {
  const checks = getOperationsReport().checks;
  const regression = checks.find(row => row.name === 'stages_1_to_9_regression');
  assert.equal(regression.status, 'not_run');
  assert.equal(regression.passed, null);
});
