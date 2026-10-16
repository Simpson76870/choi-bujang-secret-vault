import { createHash } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { decide } from './decide.mjs';

const rulesUrl = new URL('./deny-rules.json', import.meta.url);
const logUrl = new URL('../alerts.log', import.meta.url);
const ttlMs = 15 * 60 * 1000;

export function sourceKey(sourceAddress) {
  return createHash('sha256').update(`known-cve:${JSON.stringify(sourceAddress)}`).digest('hex');
}

function safeAlertId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(value) ? value : null;
}

export async function respond(fixture, result,
  { rulesFile = rulesUrl, alertsFile = logUrl, clock = Date.now } = {}) {
  const rows = new Map(Array.isArray(fixture?.alerts)
    ? fixture.alerts.map(alert => [safeAlertId(alert?.id), alert]).filter(([id]) => id) : []);
  const decisions = Array.isArray(result?.decisions) ? result.decisions : [];
  const rules = [];
  const startsAt = new Date(clock()).toISOString();
  const expiresAt = new Date(Date.parse(startsAt) + ttlMs).toISOString();

  for (const item of decisions) {
    const alertId = safeAlertId(item?.alertId);
    const alert = alertId && rows.get(alertId);
    if (!alert) continue;
    const verified = decide(alert);
    if (item.action === 'block' && item.confidence >= 0.85 && verified.action === 'block') {
      rules.push({
        ruleId: `xdr.known_cve.${alertId.replace(/[^A-Za-z0-9_]/g, '_')}`,
        action: 'deny', sourceKey: sourceKey(alert?.data?.srcip), alertId,
        pattern: verified.reason, startsAt, expiresAt,
      });
    }
    if (item.action === 'alert' && verified.action === 'alert') {
      await appendFile(alertsFile, `${JSON.stringify({
        moduleKey: 'known-cve', alertId, action: 'alert',
        pattern: verified.reason, confidence: item.confidence,
      })}\n`, { encoding: 'utf8', mode: 0o600 });
    }
  }
  await writeFile(rulesFile, `${JSON.stringify({
    schema: 'aleph.xdr.deny.v1', scope: 'local_fixture', rules,
  }, null, 2)}\n`, 'utf8');
  return rules;
}

export function createXdrDecider({ baseDecide, resolveSubject, clock = Date.now, rulesFile = rulesUrl }) {
  if (typeof baseDecide !== 'function' || typeof resolveSubject !== 'function') {
    throw new TypeError('trusted_mapping_required');
  }
  return async function decideRequest(request) {
    const resolved = await resolveSubject(request.subjectId);
    const data = JSON.parse(await readFile(rulesFile, 'utf8'));
    const at = clock();
    const key = resolved?.sourceAddress ? sourceKey(resolved.sourceAddress) : null;
    const hits = data.schema === 'aleph.xdr.deny.v1' && Array.isArray(data.rules)
      ? data.rules.filter(rule => rule.action === 'deny' && rule.sourceKey === key
        && typeof rule.alertId === 'string' && typeof rule.ruleId === 'string'
        && Date.parse(rule.startsAt) <= at && at < Date.parse(rule.expiresAt)) : [];
    if (hits.length) {
      return { schema: 'aleph.decision.v1', requestId: request.requestId,
        decision: 'deny', reasonCode: 'xdr_known_cve', ruleIds: hits.map(rule => rule.ruleId) };
    }
    return baseDecide(request);
  };
}
