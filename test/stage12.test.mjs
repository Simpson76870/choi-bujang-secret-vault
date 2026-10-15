import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('stage 12 operations room reads measured API data and labels unrun tests honestly', async () => {
  const page = await read('../public/operations.html');
  assert.match(page, /fetch\('\/api\/operations'/u);
  assert.match(page, /not_run/u);
  assert.match(page, /expectedCases/u);
  assert.match(page, /RULE_IDS|ruleIds/u);
  assert.doesNotMatch(page, /note\.body|note\.content|Bearer\s/u);
});

test('operations API reports real decider rules and does not fake detection or 41-case success', async () => {
  const api = await read('../api/restore-note.js');
  assert.match(api, /ruleIds: \[\.\.\.RULE_IDS\]/u);
  assert.match(api, /status: 'not_run',[\s\S]*source: 'no_runtime_event_feed'/u);
  assert.match(api, /expectedCases: 41,[\s\S]*status: 'not_run'/u);
});

test('stage 12 config and self-check support stage 12', async () => {
  const config = JSON.parse(await read('../aleph.config.json'));
  const checker = await read('../src/attack-check.mjs');
  assert.equal(config.step, 12);
  assert.match(checker, /10, 11, 12\]\.includes\(config\.step\)/u);
  assert.match(checker, /observed: 'not_run'/u);
  assert.match(checker, /attackId: 'static_note_read',[\s\S]*?observed: 'not_run'/u);
  assert.match(checker, /attackId: 'anonymous_list',[\s\S]*?observed: 'not_run'/u);
  assert.match(checker, /attackId: 'anonymous_get',[\s\S]*?observed: 'not_run'/u);
});

test('README identifies the supplied engine and honest non-run scope', async () => {
  const readme = await read('../README.md');
  assert.match(readme, /12단계 저장점: 탈환 작전실/u);
  assert.match(readme, /ALEPH SDP 엔진은 제공 엔진/u);
  assert.match(readme, /미실행/u);
});
