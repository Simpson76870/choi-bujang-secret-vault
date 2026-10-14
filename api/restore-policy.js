import { getNotesRuntime } from '../src/notes-runtime.mjs';
import {
  canonicalJson, diffPolicy, loadVerifiedPolicyBackup, policyDigest, sha256, validatePolicyState,
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

async function judgeContext(request, response, runtimeLoader) {
  let runtime;
  try { runtime = await runtimeLoader(); }
  catch {
    send(response, 503, { error: 'RESTORE_SERVICE_UNAVAILABLE' });
    return null;
  }
  let identity = null;
  try { identity = await runtime.verifyLoginAuthorization(request.headers?.authorization); }
  catch { identity = null; }
  if (!identity) {
    response.setHeader('WWW-Authenticate', 'Bearer');
    send(response, 401, { error: 'AUTH_REQUIRED' });
    return null;
  }
  if (identity.kind !== 'judge') {
    send(response, 403, { error: 'RESTORE_OPERATOR_REQUIRED' });
    return null;
  }
  return { ...runtime, identity };
}

async function currentTestPolicy(supabase) {
  const { data, error } = await supabase.from('training_test_policy_state')
    .select('id,version,policy,policy_sha256').eq('id', 'active').maybeSingle();
  if (error) throw new Error('TEST_POLICY_STATE_UNAVAILABLE');
  if (!data) throw new Error('TEST_POLICY_STATE_UNAVAILABLE');
  return validatePolicyState(data);
}

export function createPolicyRestoreHandler({
  runtimeLoader = getNotesRuntime,
  backupLoader = loadVerifiedPolicyBackup,
} = {}) {
  return async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');

    if (!['GET', 'POST'].includes(request.method)) {
      response.setHeader('Allow', 'GET, POST');
      return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    }

    const context = await judgeContext(request, response, runtimeLoader);
    if (!context) return;

    let backup;
    try { backup = await backupLoader(); }
    catch (error) {
      const missing = error?.message === 'POLICY_BACKUP_MISSING';
      return send(response, 503, { error: missing ? 'POLICY_BACKUP_MISSING' : 'POLICY_BACKUP_INVALID' });
    }

    let current;
    try { current = await currentTestPolicy(context.supabase); }
    catch (error) {
      const invalid = error?.message === 'TEST_POLICY_STATE_INVALID';
      return send(response, 409, { error: invalid ? 'TEST_POLICY_STATE_INVALID' : 'TEST_POLICY_STATE_UNAVAILABLE',
        backupVersion: backup.backupVersion, restoreExecuted: false });
    }

    const currentHash = policyDigest(current.policy);
    const changes = diffPolicy(current.policy, backup.policy);
    if (request.method === 'GET') {
      return send(response, 200, {
        action: 'preview_policy_restore',
        scope: 'test_policy_only',
        backupVersion: backup.backupVersion,
        backupSourceCommit: backup.source.commit,
        currentVersion: current.version,
        currentSha256: currentHash,
        changeCount: changes.length,
        changedItems: changes,
        requiresConfirmation: changes.length > 0,
        operationalPolicyTouched: false,
      });
    }

    const input = bodyObject(request);
    const exactKeys = ['backupVersion', 'confirm', 'expectedCurrentSha256'];
    if (!input || Object.keys(input).sort().join(',') !== exactKeys.sort().join(',')
        || input.backupVersion !== backup.backupVersion || input.confirm !== true
        || input.expectedCurrentSha256 !== currentHash) {
      return send(response, 400, { error: 'RESTORE_CONFIRMATION_INVALID',
        backupVersion: backup.backupVersion, changedItems: changes, restoreExecuted: false });
    }
    if (current.policy_sha256 !== currentHash) {
      return send(response, 409, { error: 'TEST_POLICY_STATE_INVALID', restoreExecuted: false });
    }
    if (changes.length === 0) {
      return send(response, 409, { error: 'NO_POLICY_CHANGES', changedItems: [],
        backupVersion: backup.backupVersion, restoreExecuted: false });
    }

    // A preview is not authority to restore from a previously read object. Re-read
    // and re-verify the backup immediately before mutation, and fail closed if it
    // disappeared, became invalid, or differs from the snapshot shown to the judge.
    let verifiedBackup;
    try {
      verifiedBackup = await backupLoader();
    } catch (error) {
      const missing = error?.message === 'POLICY_BACKUP_MISSING';
      return send(response, missing ? 503 : 409, {
        error: missing ? 'POLICY_BACKUP_MISSING' : 'POLICY_BACKUP_INVALID',
        backupVersion: backup.backupVersion,
        changedItems: changes,
        restoreExecuted: false,
      });
    }
    const initialFingerprint = sha256(canonicalJson(backup));
    const verifiedFingerprint = sha256(canonicalJson(verifiedBackup));
    if (verifiedFingerprint !== initialFingerprint
        || verifiedBackup.backupVersion !== backup.backupVersion
        || verifiedBackup.source?.commit !== backup.source?.commit
        || policyDigest(verifiedBackup.policy) !== policyDigest(backup.policy)) {
      return send(response, 409, {
        error: 'POLICY_BACKUP_CHANGED',
        backupVersion: backup.backupVersion,
        changedItems: changes,
        restoreExecuted: false,
      });
    }

    let result;
    try {
      const { data, error } = await context.supabase.rpc('restore_stage10_test_policy', {
        p_expected_current_sha256: currentHash,
        p_backup_version: verifiedBackup.backupVersion,
        p_backup_policy: verifiedBackup.policy,
        p_backup_policy_sha256: policyDigest(verifiedBackup.policy),
        p_source_commit: verifiedBackup.source.commit,
        p_actor_id: context.identity.userId,
        p_changed_items: changes.map(item => item.path),
      });
      if (error || !data) throw new Error('POLICY_RESTORE_FAILED');
      result = data;
    } catch {
      return send(response, 503, { error: 'POLICY_RESTORE_FAILED', restoreExecuted: false });
    }
    return send(response, 200, {
      action: 'restore_test_policy',
      restored: true,
      backupVersion: verifiedBackup.backupVersion,
      restoredSha256: policyDigest(verifiedBackup.policy),
      changedItems: changes,
      auditRecorded: true,
      operationalPolicyTouched: false,
      result,
    });
  };
}

export default createPolicyRestoreHandler();
