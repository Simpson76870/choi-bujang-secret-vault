import { applyStep10Restore, makeStep10RestorePlan } from './restore-policy-core.mjs';

const action = process.argv[2];
const args = process.argv.slice(3);
const confirm = args.filter(value => value.startsWith('--confirm='));
const unknown = args.filter(value => !value.startsWith('--confirm='));

try {
  if (action === 'plan' && !args.length) {
    const result = await makeStep10RestorePlan();
    process.stdout.write(JSON.stringify({
      status: 'plan_verified',
      backupVersion: result.backupVersion,
      backupSha256: result.backupSha256,
      currentPolicySha256: result.currentPolicySha256,
      changedItems: result.changedItems,
      changedItemCount: result.changedItemCount,
      planSha256: result.planSha256,
      operationalPolicyTouched: false,
      auditHistoryTouched: false,
    }, null, 2) + '\\n');
  } else if (action === 'apply' && confirm.length === 1 && unknown.length === 0) {
    const result = await applyStep10Restore({ confirmVersion: confirm[0].slice('--confirm='.length) });
    process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
  } else {
    console.error('Usage: npm run restore:plan | npm run restore:apply -- --confirm=<backupVersion>');
    process.exitCode = 2;
  }
} catch (error) {
  const allowed = new Set([
    'POLICY_BACKUP_MISSING', 'POLICY_BACKUP_UNVERIFIED', 'POLICY_BACKUP_INVALID',
    'CURRENT_TEST_POLICY_INVALID', 'POLICY_VERSION_CONFIRMATION_REQUIRED',
    'RESTORE_PLAN_REQUIRED', 'RESTORE_PLAN_STALE',
  ]);
  console.error(allowed.has(error?.message) ? error.message : 'POLICY_RECOVERY_FAILED');
  process.exitCode = 1;
}
