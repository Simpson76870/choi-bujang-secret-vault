import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { readAlerts, extractAlert } from '../xdr/web-injection/read-alerts.mjs';
import { decide } from '../xdr/web-injection/decide.mjs';
import { respond, createXdrDecider } from '../xdr/web-injection/respond.mjs';

const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/web-injection.json', import.meta.url), 'utf8'));
const patterns = JSON.parse(await readFile(new URL('../xdr/web-injection/patterns.json', import.meta.url), 'utf8'));

test('reader preserves count, emits five fields, and redacts secret-looking descriptions', async () => {
  const rows = await readAlerts();
  assert.equal(rows.length, fixture.alerts.length);
  assert.deepEqual(Object.keys(rows[0]), ['timestamp', 'sourceAddress', 'account', 'level', 'description']);
  const row = extractAlert({ timestamp: fixture.alerts[0].timestamp,
    data: { srcip: '192.0.2.1', srcuser: 'user01', token: 'private-input' },
    rule: { level: 5, description: 'token=private-input password=other-private\nnext' } });
  assert(!JSON.stringify(row).includes('private-input'));
  assert(!JSON.stringify(row).includes('other-private'));
  assert(!row.description.includes('\n'));
});

test('every documented pattern has a one-line evidence statement', () => {
  assert.deepEqual(patterns.patterns.map(pattern => pattern.name),
    ['sql_injection', 'script_injection', 'path_traversal']);
  assert(patterns.patterns.every(pattern => typeof pattern.evidence === 'string'
    && pattern.evidence.length > 0 && !/[\r\n]/.test(pattern.evidence)));
});

test('clear attacks block, ambiguity alerts, and normal events record', async () => {
  const outcomes = await Promise.all(fixture.alerts.map(decide));
  const counts = { block: 0, alert: 0, record: 0 };
  for (let index = 0; index < outcomes.length; index += 1) {
    const value = outcomes[index];
    counts[value.action] += 1;
    assert.deepEqual(Object.keys(value), ['action', 'confidence', 'reason']);
    assert(!value.reason.includes('\n'));
    assert.deepEqual(await decide({ ...fixture.alerts[index], id: 'changed-id' }), value);
  }
  assert.deepEqual(counts, { block: 8, alert: 9, record: 9 });
  assert(outcomes.slice(0, 8).every(value => value.action === 'block'));
  assert(outcomes.slice(8, 17).every(value => value.action === 'alert'));
  assert(outcomes.slice(17).every(value => value.action === 'record'));
});

test('decide is a standalone synchronous offline module', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wi-isolated-'));
  try {
    const source = await readFile(new URL('../xdr/web-injection/decide.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /^\s*import\s/m);
    assert.doesNotMatch(source, /node:|readFile|writeFile|appendFile|fetch\s*\(|process\.env|setTimeout|setInterval/);
    const isolatedFile = join(dir, 'decide.mjs');
    await writeFile(isolatedFile, source, 'utf8');
    const isolated = await import(`${pathToFileURL(isolatedFile).href}?judge=1`);
    const direct = isolated.decide(fixture.alerts[0]);
    assert(!(direct instanceof Promise));
    assert.equal(direct.action, 'block');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('respond creates only clear expiring rules and preserves normal base decisions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wi-respond-'));
  try {
    const rulesFile = join(dir, 'rules.json');
    const alertsFile = join(dir, 'alerts.log');
    const decisions = fixture.alerts.map(alert => ({ alertId: alert.id, ...decide(alert) }));
    const at = Date.parse('2026-10-08T00:00:00.000Z');
    const rules = await respond(fixture, { decisions }, { rulesFile, alertsFile, clock: () => at });
    assert.equal(rules.length, 8);
    assert(rules.every(rule => rule.action === 'deny' && rule.alertId
      && Date.parse(rule.expiresAt) - Date.parse(rule.startsAt) === 900000));
    const lines = (await readFile(alertsFile, 'utf8')).trim().split('\n');
    assert.equal(lines.length, 9);
    assert(!lines.join('').includes('srcip'));

    const mapping = subjectId => subjectId === 'attack'
      ? { sourceAddress: fixture.alerts[0].data.srcip }
      : { sourceAddress: fixture.alerts[17].data.srcip };
    const baseDecide = async request => ({ schema: 'aleph.decision.v1', requestId: request.requestId,
      decision: 'allow', reasonCode: 'approved', ruleIds: [] });
    const overlay = createXdrDecider({ baseDecide, resolveSubject: mapping, clock: () => at + 1, rulesFile });
    const request = { schema: 'aleph.decision.v1', requestId: 'web-test', subjectId: 'attack' };
    assert.equal((await overlay(request)).decision, 'deny');
    assert.equal((await overlay({ ...request, subjectId: 'normal' })).decision, 'allow');

    const ambiguous = fixture.alerts[8];
    const rejected = await respond({ alerts: [ambiguous] },
      { decisions: [{ alertId: ambiguous.id, action: 'block', confidence: 0.99, reason: 'sql_injection' }] },
      { rulesFile, alertsFile, clock: () => at });
    assert.equal(rejected.length, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
