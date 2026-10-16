import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const TTL_MS = 30 * 60 * 1000;
export async function respond(fixture, result) {
  const base = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const rulesPath = join(base, 'xdr', 'persistence', 'deny-rules.json');
  const logPath = join(base, 'xdr', 'alerts.log');
  let existing = [];
  try {
    const parsed = JSON.parse(await readFile(rulesPath, 'utf8'));
    existing = Array.isArray(parsed.rules) ? parsed.rules : [];
  } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const byId = new Map(existing.filter(rule => rule && typeof rule.alertId === 'string').map(rule => [rule.alertId, rule]));
  const alertsById = new Map(fixture.alerts.map(alert => [alert.id, alert]));
  const now = Date.now();
  const newRules = [];
  for (const decision of result.decisions) {
    const alert = alertsById.get(decision.alertId);
    if (!alert) continue;
    const line = JSON.stringify({ timestamp: alert.timestamp, alertId: alert.id, action: decision.action, confidence: decision.confidence, reason: decision.reason, sourceAddress: alert.data?.srcip ?? '' });
    await appendFile(logPath, line + '\n', 'utf8');
    if (decision.action !== 'block' || decision.confidence < 0.85) continue;
    const sourceAddress = alert.data?.srcip;
    if (typeof sourceAddress !== 'string' || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(sourceAddress)) continue;
    const rule = { alertId: alert.id, sourceAddress, action: 'deny', reason: decision.reason, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL_MS).toISOString() };
    byId.set(alert.id, rule);
    newRules.push(rule);
  }
  await writeFile(rulesPath, JSON.stringify({ schema: 'aleph.xdr.deny-rules.v1', rules: [...byId.values()] }, null, 2) + '\n', 'utf8');
  return { added: newRules.length, rules: newRules };
}
