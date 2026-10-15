import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { RECOVERY_POLICY_VIEW } from './decider.mjs';

export const SAFE_POLICY_VERSION = 'stage9-safe-policy-v1';
export const SAFE_POLICY_SOURCE_COMMIT = 'f1dfff0d44c5c08e68fcf3e10b0075609f5e2269';
export const SAFE_POLICY_RAW_SHA256 = '399add7457d65767662a4ddcbcdf81276476c6d23f6e5567fcded2e62100885f';
export const B_NOTE_BACKUP_VERSION = 'stage4-b-preincident-v1';
export const B_NOTE_FIXTURE_KEY = 'stage4_b_private_note';
export const B_NOTE_SOURCE_COMMIT = 'f1dfff0d44c5c08e68fcf3e10b0075609f5e2269';
const SAFE_POLICY_PATH = new URL('../backups/policies/stage9-safe-policy.json', import.meta.url);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA256 = /^[a-f0-9]{64}$/u;
const SHA = /^[a-f0-9]{40}$/u;

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

export function policyDigest(policy) {
  return sha256(canonicalJson(policy));
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isJsonValue(value, depth = 0) {
  if (depth > 8) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 512;
  if (Array.isArray(value)) return value.length <= 100 && value.every(item => isJsonValue(item, depth + 1));
  if (!plainObject(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 100 && entries.every(([key, item]) =>
    /^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/u.test(key) && isJsonValue(item, depth + 1));
}

export function validatePolicySnapshot(raw) {
  if (typeof raw !== 'string' || sha256(raw) !== SAFE_POLICY_RAW_SHA256) {
    throw new Error('POLICY_BACKUP_INTEGRITY_FAILED');
  }
  let snapshot;
  try { snapshot = JSON.parse(raw); } catch { throw new Error('POLICY_BACKUP_FORMAT_INVALID'); }
  if (!plainObject(snapshot)
      || snapshot.schema !== 'aleph.safe-policy-backup.v1'
      || snapshot.backupVersion !== SAFE_POLICY_VERSION
      || snapshot.source?.commit !== SAFE_POLICY_SOURCE_COMMIT
      || snapshot.source?.files?.['src/decider.mjs'] !== '1c5bbb0bc24f5a5075174561b60a209f563fe0ea'
      || snapshot.source?.files?.['aleph.config.json'] !== '94bfb9a59b9df15e464208b226a10a37d4c1587c'
      || !isJsonValue(snapshot.policy)
      || !plainObject(snapshot.policy)
      || !Array.isArray(snapshot.policy.ruleIds)
      || snapshot.policy.defaultDecision !== 'deny'
      || snapshot.policy.requireDeviceRegistered !== true
      || !Array.isArray(snapshot.policy.resources)) {
    throw new Error('POLICY_BACKUP_PROVENANCE_INVALID');
  }
  return Object.freeze(snapshot);
}

export async function loadVerifiedPolicyBackup() {
  let raw;
  try { raw = await readFile(SAFE_POLICY_PATH, 'utf8'); }
  catch { throw new Error('POLICY_BACKUP_MISSING'); }
  return validatePolicySnapshot(raw);
}

export function validatePolicyState(row) {
  if (!plainObject(row) || typeof row.version !== 'string' || !row.version
      || !plainObject(row.policy) || typeof row.policy_sha256 !== 'string'
      || !SHA256.test(row.policy_sha256) || !isJsonValue(row.policy)
      || policyDigest(row.policy) !== row.policy_sha256) {
    throw new Error('TEST_POLICY_STATE_INVALID');
  }
  return row;
}

function same(a, b) {
  return canonicalJson(a) === canonicalJson(b);
}

export function diffPolicy(current, restored) {
  if (!plainObject(current) || !plainObject(restored)) throw new Error('POLICY_DIFF_INPUT_INVALID');
  if (!isJsonValue(current) || !isJsonValue(restored)) throw new Error('POLICY_DIFF_INPUT_INVALID');
  const changes = [];
  const walk = (before, after, path) => {
    if (same(before, after)) return;
    if (plainObject(before) && plainObject(after)) {
      const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
      for (const key of keys) {
        const hasBefore = Object.hasOwn(before, key);
        const hasAfter = Object.hasOwn(after, key);
        const next = path ? path + '.' + key : key;
        if (!hasBefore || !hasAfter) {
          changes.push({ path: next, change: hasBefore ? 'removed' : 'added' });
        } else {
          walk(before[key], after[key], next);
        }
      }
      return;
    }
    if (Array.isArray(before) && Array.isArray(after)) {
      const common = Math.min(before.length, after.length);
      for (let index = 0; index < common; index += 1) walk(before[index], after[index], path + '[' + index + ']');
      for (let index = common; index < Math.max(before.length, after.length); index += 1) {
        changes.push({ path: path + '[' + index + ']', change: index < before.length ? 'removed' : 'added' });
      }
      return;
    }
    changes.push({ path, change: 'changed' });
  };
  walk(current, restored, '');
  return changes.slice(0, 200);
}

// Compare the live, read-only policy projection against the independently
// verified pre-incident snapshot. This is separate from the user-triggered
// restore-plan artifact and never writes the operational policy.
export async function compareCurrentPolicyWithBackup() {
  const snapshot = await loadVerifiedPolicyBackup();
  const currentPolicy = JSON.parse(JSON.stringify(RECOVERY_POLICY_VIEW));
  const changedItems = diffPolicy(currentPolicy, snapshot.policy);
  const currentPolicySha256 = policyDigest(currentPolicy);
  const backupPolicySha256 = policyDigest(snapshot.policy);
  const comparisonSha256 = sha256(canonicalJson({
    backupVersion: snapshot.backupVersion,
    currentPolicySha256,
    backupPolicySha256,
    changedItems,
  }));
  return {
    verified: changedItems.length === 0,
    backupVersion: snapshot.backupVersion,
    currentPolicySha256,
    backupPolicySha256,
    changedItems,
    changedItemCount: changedItems.length,
    comparisonSha256,
  };
}

export function noteContentSha256(content) {
  if (typeof content !== 'string' || content.length > 2000) throw new Error('NOTE_BACKUP_CONTENT_INVALID');
  return sha256(content);
}

function timingSafeHexEqual(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string'
      || !SHA256.test(actual) || !SHA256.test(expected)) return false;
  const left = Buffer.from(actual, 'hex');
  const right = Buffer.from(expected, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function noteBackupManifestSha256(snapshot) {
  return sha256(canonicalJson({
    noteId: snapshot.note_id,
    ownerId: snapshot.owner_id,
    title: snapshot.title,
    contentSha256: snapshot.content_sha256,
    backupVersion: snapshot.backup_version,
    fixtureKey: snapshot.fixture_key,
    sourceCommit: snapshot.source_commit,
  }));
}

export function validateBNoteBackup(snapshot, expectedNoteId, expectedOwnerId) {
  if (!plainObject(snapshot)
      || !UUID.test(snapshot.note_id ?? '')
      || !UUID.test(snapshot.owner_id ?? '')
      || snapshot.note_id !== expectedNoteId
      || snapshot.owner_id !== expectedOwnerId
      || snapshot.fixture_key !== B_NOTE_FIXTURE_KEY
      || snapshot.backup_version !== B_NOTE_BACKUP_VERSION
      || snapshot.source_commit !== B_NOTE_SOURCE_COMMIT
      || snapshot.title !== '공개 시험 메모'
      || snapshot.content !== '4단계 소유자 권한 검증에 사용하는 가상 메모입니다.'
      || typeof snapshot.verified_at !== 'string'
      || !Number.isFinite(Date.parse(snapshot.verified_at))
      || !SHA256.test(snapshot.content_sha256 ?? '')
      || !timingSafeHexEqual(snapshot.content_sha256, noteContentSha256(snapshot.content))
      || !timingSafeHexEqual(snapshot.manifest_sha256, noteBackupManifestSha256(snapshot))) {
    throw new Error('VERIFIED_BACKUP_INVALID');
  }
  return snapshot;
}
