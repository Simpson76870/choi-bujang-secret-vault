import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readAlerts } from '../xdr/persistence/read-alerts.mjs';
import { decide } from '../xdr/persistence/decide.mjs';
const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/persistence.json', import.meta.url), 'utf8'));
test('reader returns one sanitized five-field row per alert without changing fixture', () => {
  const before = JSON.stringify(fixture);
  const rows = readAlerts(fixture);
  assert.equal(rows.length, fixture.alerts.length);
  assert.ok(rows.every(row => Object.keys(row).length === 5));
  assert.equal(JSON.stringify(fixture), before);
  assert.ok(!JSON.stringify(rows).includes('C:\\\\Users\\\\user01'));
});
test('pattern list contains evidence for every grounded pattern', async () => {
  const patterns = JSON.parse(await readFile(new URL('../xdr/persistence/patterns.json', import.meta.url), 'utf8')).patterns;
  assert.ok(patterns.length >= 3);
  assert.ok(patterns.every(p => p.name && p.conditions.length && p.evidence.length));
});
test('attacks block, ambiguous changes alert, and normal events record', () => {
  const outcomes = fixture.alerts.map(alert => decide(alert).action);
  assert.deepEqual(outcomes.slice(0, 8), Array(8).fill('block'));
  assert.deepEqual(outcomes.slice(8, 16), Array(8).fill('alert'));
  assert.deepEqual(outcomes.slice(16), Array(8).fill('record'));
});
test('judge module contains no imports', async () => {
  const source = await readFile(new URL('../xdr/persistence/decide.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\s/m);
});
