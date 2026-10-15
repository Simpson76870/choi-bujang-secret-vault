import { randomUUID } from 'node:crypto';

const KEY = Symbol.for('aleph.stage10.recovery-ledger.v1');
const CHECK_NAMES = Object.freeze([
  'backup_outer_sha256',
  'backup_content_sha256',
  'restore_plan_confirmation',
  'restore_database_readback',
  'post_restore_own_note_read',
  'post_restore_foreign_note_denial',
  'policy_backup_sha256',
  'policy_backup_scope_comparison',
  'stages_1_to_9_regression',
]);

function ledger() {
  if (!globalThis[KEY]) {
    Object.defineProperty(globalThis, KEY, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: { audits: [], observations: new Map() },
    });
  }
  return globalThis[KEY];
}

// The process-local history is append-only by API design. It never stores note
// bodies, bearer tokens, passwords, or arbitrary request payloads.
export function appendRecoveryAudit(event) {
  if (!event || typeof event.ownerId !== 'string' || typeof event.noteId !== 'string'
      || typeof event.action !== 'string') return null;
  const item = Object.freeze({
    eventId: randomUUID(),
    at: new Date().toISOString(),
    ownerId: event.ownerId,
    actorId: typeof event.actorId === 'string' ? event.actorId : null,
    noteId: event.noteId,
    action: event.action,
    result: typeof event.result === 'string' ? event.result : 'unknown',
    backupVersion: typeof event.backupVersion === 'string' ? event.backupVersion : null,
    contentSha256: typeof event.contentSha256 === 'string' ? event.contentSha256 : null,
    retests: event.retests && typeof event.retests === 'object' ? Object.freeze({
      normalStatus: Number.isInteger(event.retests.normalStatus) ? event.retests.normalStatus : null,
      normalPassed: event.retests.normalPassed === true,
      forbiddenStatus: Number.isInteger(event.retests.forbiddenStatus) ? event.retests.forbiddenStatus : null,
      forbiddenPassed: event.retests.forbiddenPassed === true,
      passed: event.retests.passed === true,
    }) : null,
  });
  ledger().audits.push(item);
  return item;
}

export function getRecoveryAuditForOwner(ownerId) {
  if (typeof ownerId !== 'string') return [];
  return ledger().audits
    .filter(item => item.ownerId === ownerId)
    .map(item => ({
      eventId: item.eventId,
      at: item.at,
      noteId: item.noteId,
      action: item.action,
      result: item.result,
      backupVersion: item.backupVersion,
      contentSha256: item.contentSha256,
      retests: item.retests ? { ...item.retests } : null,
    }));
}

export function recordOperation(name, { passed, code } = {}) {
  if (!CHECK_NAMES.includes(name)) return false;
  const observation = Object.freeze({
    name,
    status: 'measured',
    passed: passed === true,
    code: typeof code === 'string' && /^[a-z0-9_]{1,64}$/u.test(code) ? code : 'result_recorded',
    at: new Date().toISOString(),
  });
  ledger().observations.set(name, observation);
  return true;
}

export function getOperationsReport() {
  const observations = ledger().observations;
  return {
    schema: 'aleph.stage10.operations.v1',
    evidenceScope: 'process_local_only',
    checks: CHECK_NAMES.map(name => {
      const observed = observations.get(name);
      return observed ? { ...observed } : { name, status: 'not_run', passed: null, code: null, at: null };
    }),
    recoveryAuditEvents: ledger().audits.length,
    note: 'Process-local observations only; not_run is not a pass and this report is not a durable cross-instance audit store.',
  };
}
