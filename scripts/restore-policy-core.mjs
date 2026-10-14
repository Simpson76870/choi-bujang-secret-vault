import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECOVERY_POLICY_VIEW } from '../src/decider.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP_PATH = join(ROOT, 'backups', 'step10', 'safe-policy.json');
const HASH_PATH = join(ROOT, 'backups', 'step10', 'safe-policy.sha256');
const ARTIFACT_DIR = join(ROOT, 'artifacts');
const PLAN_PATH = join(ARTIFACT_DIR, 'restore-plan.json');
const APPLY_PATH = join(ARTIFACT_DIR, 'restore-apply.json');
const OUTPUT_POLICY_PATH = join(ARTIFACT_DIR, 'restored-test-policy.json');
const PINNED_SHA256 = '399add7457d65767662a4ddcbcdf81276476c6d23f6e5567fcded2e62100885f';
const SHA = /^[a-f0-9]{64}$/u;

const fail = code => { throw new Error(code); };
const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
function timingSafeHashMatch(actual, expected) {
  if (!SHA.test(actual ?? '') || !SHA.test(expected ?? '')) return false;
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}
function canonical(value) { return JSON.stringify(stable(value)); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

export async function loadStep10PolicyBackup() {
  let raw;
  let hashText;
  try {
    [raw, hashText] = await Promise.all([
      readFile(BACKUP_PATH, 'utf8'),
      readFile(HASH_PATH, 'utf8'),
    ]);
  } catch { fail('POLICY_BACKUP_MISSING'); }

  const declared = /^([a-f0-9]{64})(?:\s+safe-policy\.json)?\s*$/u.exec(hashText)?.[1];
  const actual = sha256(raw);
  if (!declared || !timingSafeHashMatch(declared, PINNED_SHA256)
      || !timingSafeHashMatch(actual, declared)) fail('POLICY_BACKUP_UNVERIFIED');

  let snapshot;
  try { snapshot = JSON.parse(raw); } catch { fail('POLICY_BACKUP_INVALID'); }
  if (!object(snapshot) || snapshot.schema !== 'aleph.safe-policy-backup.v1'
      || snapshot.backupVersion !== 'stage9-safe-policy-v1'
      || snapshot.source?.commit !== 'f1dfff0d44c5c08e68fcf3e10b0075609f5e2269'
      || !object(snapshot.policy)
      || !Array.isArray(snapshot.policy.ruleIds)
      || snapshot.policy.defaultDecision !== 'deny'
      || snapshot.policy.requireDeviceRegistered !== true
      || !object(snapshot.policy.stepUp)
      || !Array.isArray(snapshot.policy.resources)) fail('POLICY_BACKUP_INVALID');
  return { raw, sha256: actual, snapshot };
}

function diffPaths(before, after, path = '') {
  if (canonical(before) === canonical(after)) return [];
  if (object(before) && object(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap(key => {
      const hasBefore = Object.hasOwn(before, key);
      const hasAfter = Object.hasOwn(after, key);
      const next = path ? path + '.' + key : key;
      if (!hasBefore || !hasAfter) return [{ path: next, change: hasBefore ? 'removed' : 'added' }];
      return diffPaths(before[key], after[key], next);
    });
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const result = [];
    const length = Math.max(before.length, after.length);
    for (let i = 0; i < length; i += 1) {
      const next = path + '[' + i + ']';
      if (i >= before.length) result.push({ path: next, change: 'added' });
      else if (i >= after.length) result.push({ path: next, change: 'removed' });
      else result.push(...diffPaths(before[i], after[i], next));
    }
    return result;
  }
  return [{ path, change: 'changed' }];
}

function currentPolicyFromEnvironment(env = process.env) {
  if (typeof env.ALEPH_RESTORE_CURRENT_POLICY_JSON === 'string'
      && env.ALEPH_RESTORE_CURRENT_POLICY_JSON.trim()) {
    let parsed;
    try { parsed = JSON.parse(env.ALEPH_RESTORE_CURRENT_POLICY_JSON); }
    catch { fail('CURRENT_TEST_POLICY_INVALID'); }
    if (!object(parsed)) fail('CURRENT_TEST_POLICY_INVALID');
    return parsed;
  }
  // Read-only projection of the running decider; never writes src/decider.mjs.
  return JSON.parse(JSON.stringify(RECOVERY_POLICY_VIEW));
}

export async function makeStep10RestorePlan({ env = process.env } = {}) {
  const backup = await loadStep10PolicyBackup();
  const currentPolicy = currentPolicyFromEnvironment(env);
  const currentPolicySha256 = sha256(canonical(currentPolicy));
  const changedItems = diffPaths(currentPolicy, backup.snapshot.policy);
  const plan = {
    schema: 'aleph.stage10.restore-plan.v1',
    backupVersion: backup.snapshot.backupVersion,
    backupSha256: backup.sha256,
    currentPolicySha256,
    changedItems,
    changedItemCount: changedItems.length,
    planSha256: sha256(canonical({
      backupVersion: backup.snapshot.backupVersion,
      backupSha256: backup.sha256,
      currentPolicySha256,
      changedItems,
    })),
    restoreScope: 'test_policy_artifact_only',
    operationalPolicyTouched: false,
    auditHistoryTouched: false,
  };
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await writeFile(PLAN_PATH, JSON.stringify(plan, null, 2) + '\n', { mode: 0o600 });
  return plan;
}

export async function applyStep10Restore({ confirmVersion, env = process.env } = {}) {
  const backup = await loadStep10PolicyBackup();
  if (typeof confirmVersion !== 'string' || confirmVersion !== backup.snapshot.backupVersion) {
    fail('POLICY_VERSION_CONFIRMATION_REQUIRED');
  }
  let priorPlan;
  try { priorPlan = JSON.parse(await readFile(PLAN_PATH, 'utf8')); }
  catch { fail('RESTORE_PLAN_REQUIRED'); }
  const currentPolicy = currentPolicyFromEnvironment(env);
  const currentPolicySha256 = sha256(canonical(currentPolicy));
  const changedItems = diffPaths(currentPolicy, backup.snapshot.policy);
  const freshPlanSha256 = sha256(canonical({
    backupVersion: backup.snapshot.backupVersion,
    backupSha256: backup.sha256,
    currentPolicySha256,
    changedItems,
  }));
  if (priorPlan.schema !== 'aleph.stage10.restore-plan.v1'
      || priorPlan.backupVersion !== backup.snapshot.backupVersion
      || priorPlan.backupSha256 !== backup.sha256
      || priorPlan.currentPolicySha256 !== currentPolicySha256
      || priorPlan.planSha256 !== freshPlanSha256) {
    fail('RESTORE_PLAN_STALE');
  }

  // The apply command is intentionally artifact-only. It does not alter the live
  // decider, operating config, database, or any audit history.
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const artifact = {
    schema: 'aleph.stage10.restore-apply.v1',
    applied: true,
    backupVersion: backup.snapshot.backupVersion,
    backupSha256: backup.sha256,
    planSha256: priorPlan.planSha256,
    changedItems,
    output: 'artifacts/restored-test-policy.json',
    operationalPolicyTouched: false,
    auditHistoryPreserved: true,
    auditHistoryTouched: false,
  };
  await writeFile(OUTPUT_POLICY_PATH, JSON.stringify(backup.snapshot.policy, null, 2) + '\n', { mode: 0o600 });
  await writeFile(APPLY_PATH, JSON.stringify(artifact, null, 2) + '\n', { mode: 0o600 });
  return artifact;
}
