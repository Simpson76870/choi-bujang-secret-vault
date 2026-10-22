import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { decide } from '../xdr/brute-force/decide.mjs';
import { respond } from '../xdr/brute-force/respond.mjs';

const fixture = JSON.parse(await readFile(
  new URL('../xdr/fixtures/brute-force.json', import.meta.url), 'utf8',
));

test('fixture contains 28 stable test events', () => {
  assert.equal(fixture.schema, 'aleph.xdr.fixture.v1');
  assert.equal(fixture.moduleKey, 'brute-force');
  assert.equal(fixture.alerts.length, 28);
  assert.equal(new Set(fixture.alerts.map(a => a.id)).size, 28);
});

test('high-confidence brute-force patterns block; ambiguous events alert; normal events record', () => {
  const outputs = fixture.alerts.map(decide);
  const counts = { block: 0, alert: 0, record: 0 };
  for (let i = 0; i < outputs.length; i++) {
    const output = outputs[i];
    counts[output.action]++;
    assert.deepEqual(Object.keys(output), ['action', 'confidence', 'reason']);
    assert(output.confidence >= 0 && output.confidence <= 1);
    assert.equal(decide({ ...fixture.alerts[i], id: 'changed-id' }).action, output.action);
  }
  assert.deepEqual(counts, { block: 10, alert: 9, record: 9 });
  assert(outputs.slice(0, 10).every(x => x.action === 'block'));
  assert(outputs.slice(10, 19).every(x => x.action === 'alert'));
  assert(outputs.slice(19).every(x => x.action === 'record'));
});

test('judge is import-free, synchronous, and has no I/O', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'brute-force-isolated-'));
  try {
    const source = await readFile(new URL('../xdr/brute-force/decide.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /^\s*import\s/m);
    assert.doesNotMatch(source, /node:|readFile|writeFile|appendFile|fetch\s*\(|process\.env|setTimeout|setInterval/);
    const file = join(dir, 'decide.mjs');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, source);
    const isolated = await import(`${pathToFileURL(file).href}?test=1`);
    assert(!(isolated.decide(fixture.alerts[0]) instanceof Promise));
    assert.equal(isolated.decide(fixture.alerts[0]).action, 'block');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('response writes expiring local deny rules only for independently verified blocks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'brute-force-response-'));
  try {
    const rulesFile = join(dir, 'rules.json');
    const alertsFile = join(dir, 'alerts.log');
    const decisions = fixture.alerts.map(alert => ({ alertId: alert.id, ...decide(alert) }));
    const at = Date.parse('2026-10-22T00:00:00Z');
    const rules = await respond(fixture, { decisions }, { rulesFile, alertsFile, clock: () => at });
    assert.equal(rules.length, 10);
    assert(rules.every(rule => rule.action === 'deny'
      && Date.parse(rule.expiresAt) - Date.parse(rule.startsAt) === 900000));
    assert(rules.every(rule => !('sourceAddress' in rule)));
    const lines = (await readFile(alertsFile, 'utf8')).trim().split('\n');
    assert.equal(lines.length, 9);
    assert(!lines.join('').includes('203.0.113.'));
    const normal = fixture.alerts[19];
    const rejected = await respond({ alerts: [normal] }, {
      decisions: [{ alertId: normal.id, action: 'block', confidence: 0.99, reason: 'forged' }],
    }, { rulesFile, alertsFile, clock: () => at });
    assert.equal(rejected.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
