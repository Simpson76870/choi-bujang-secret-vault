import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  applyStep10Restore, loadStep10PolicyBackup, makeStep10RestorePlan,
} from '../scripts/restore-policy-core.mjs';

test('step 10 safe policy JSON and companion SHA file verify together', async () => {
  const backup = await loadStep10PolicyBackup();
  assert.equal(backup.snapshot.backupVersion, 'stage9-safe-policy-v1');
  assert.equal(backup.snapshot.policy.defaultDecision, 'deny');
  assert.equal(backup.snapshot.policy.requireDeviceRegistered, true);
  assert.match(backup.sha256, /^[a-f0-9]{64}$/u);
  const checksum = await readFile(new URL('../backups/step10/safe-policy.sha256', import.meta.url), 'utf8');
  assert.ok(checksum.startsWith(backup.sha256));
});

test('restore plan rechecks the safe copy and lists changes before any apply', async () => {
  const backup = await loadStep10PolicyBackup();
  const current = structuredClone(backup.snapshot.policy);
  current.defaultDecision = 'allow';
  const plan = await makeStep10RestorePlan({ env: {
    ALEPH_RESTORE_CURRENT_POLICY_JSON: JSON.stringify(current),
  } });
  assert.equal(plan.backupVersion, backup.snapshot.backupVersion);
  assert.equal(plan.changedItemCount, 1);
  assert.deepEqual(plan.changedItems, [{ path: 'defaultDecision', change: 'changed' }]);
  assert.equal(plan.operationalPolicyTouched, false);
  assert.equal(plan.auditHistoryTouched, false);
});

test('apply requires the exact snapshot version and writes only ignored artifacts', async () => {
  const backup = await loadStep10PolicyBackup();
  const current = structuredClone(backup.snapshot.policy);
  current.defaultDecision = 'allow';
  const env = { ALEPH_RESTORE_CURRENT_POLICY_JSON: JSON.stringify(current) };
  await makeStep10RestorePlan({ env });
  await assert.rejects(
    applyStep10Restore({ confirmVersion: 'wrong-version', env }),
    /POLICY_VERSION_CONFIRMATION_REQUIRED/u,
  );
  const applied = await applyStep10Restore({
    confirmVersion: backup.snapshot.backupVersion, env,
  });
  assert.equal(applied.applied, true);
  assert.equal(applied.operationalPolicyTouched, false);
  assert.equal(applied.auditHistoryPreserved, true);
  assert.equal(applied.auditHistoryTouched, false);
  assert.equal(applied.output, 'artifacts/restored-test-policy.json');
  const output = JSON.parse(await readFile(new URL('../artifacts/restored-test-policy.json', import.meta.url), 'utf8'));
  assert.deepEqual(output, backup.snapshot.policy);
});

test('apply refuses to use a plan when policy state changes after preview', async () => {
  const backup = await loadStep10PolicyBackup();
  const before = structuredClone(backup.snapshot.policy);
  before.defaultDecision = 'allow';
  const changed = structuredClone(before);
  changed.ruleIds = ['resource_scope'];
  await makeStep10RestorePlan({ env: {
    ALEPH_RESTORE_CURRENT_POLICY_JSON: JSON.stringify(before),
  } });
  await assert.rejects(applyStep10Restore({
    confirmVersion: backup.snapshot.backupVersion,
    env: { ALEPH_RESTORE_CURRENT_POLICY_JSON: JSON.stringify(changed) },
  }), /RESTORE_PLAN_STALE/u);
});
