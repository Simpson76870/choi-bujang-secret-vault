import { createHash } from 'node:crypto';
import { appendFile, writeFile } from 'node:fs/promises';
import { decide } from './decide.mjs';

const rulesUrl = new URL('./deny-rules.json', import.meta.url);
const logUrl = new URL('../alerts.log', import.meta.url);
const ttlMs = 15 * 60 * 1000;

export function sourceKey(sourceAddress) {
  return createHash('sha256')
    .update(`brute-force:${JSON.stringify(sourceAddress)}`)
    .digest('hex');
}

function safeAlertId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(value)
    ? value
    : null;
}

// Local fixture response only: block high-confidence verified patterns and log alerts.
// This writes local simulation artifacts; it does not configure a real firewall or IAM.
export async function respond(fixture, result,
  { rulesFile = rulesUrl, alertsFile = logUrl, clock = Date.now } = {}) {
  const rows = new Map(Array.isArray(fixture?.alerts)
    ? fixture.alerts
      .map(alert => [safeAlertId(alert?.id), alert])
      .filter(([id]) => id)
    : []);
  const decisions = Array.isArray(result?.decisions) ? result.decisions : [];
  const rules = [];
  const startsAt = new Date(clock()).toISOString();
  const expiresAt = new Date(Date.parse(startsAt) + ttlMs).toISOString();

  for (const item of decisions) {
    const alertId = safeAlertId(item?.alertId);
    const alert = alertId && rows.get(alertId);
    if (!alert) continue;

    const verified = decide(alert);
    if (item.action === 'block' && item.confidence >= 0.85
      && verified.action === 'block') {
      const sourceAddress = alert?.data?.srcip;
      if (typeof sourceAddress === 'string' && sourceAddress.length > 0) {
        rules.push({
          ruleId: `xdr.brute_force.${alertId.replace(/[^A-Za-z0-9_]/g, '_')}`,
          action: 'deny',
          sourceKey: sourceKey(sourceAddress),
          alertId,
          pattern: verified.reason,
          startsAt,
          expiresAt,
        });
      }
    }

    if (item.action === 'alert' && verified.action === 'alert') {
      await appendFile(alertsFile, `${JSON.stringify({
        moduleKey: 'brute-force',
        alertId,
        action: 'alert',
        pattern: verified.reason,
        confidence: item.confidence,
      })}\n`, { encoding: 'utf8', mode: 0o600 });
    }
  }

  await writeFile(rulesFile, `${JSON.stringify({
    schema: 'aleph.xdr.deny.v1',
    scope: 'local_fixture',
    rules,
  }, null, 2)}\n`, 'utf8');
  return rules;
}
