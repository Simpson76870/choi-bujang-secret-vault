import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('browser sends memory CRUD through Vercel API routes and keeps Auth SDK calls', async () => {
  const html = await read('../public/index.html');
  assert.match(html, /async function apiRequest\(path, options = \{\}\)/u);
  assert.match(html, /fetch\(path, \{ \.\.\.options, headers, cache: 'no-store' \}\)/u);
  assert.match(html, /apiRequest\('\/api\/notes'\)/u);
  assert.match(html, /apiRequest\('\/api\/notes\/' \+ encodeURIComponent\(id\)/u);
  assert.match(html, /supabase\.auth\.signUp/u);
  assert.match(html, /supabase\.auth\.signInWithPassword/u);
  assert.match(html, /supabase\.auth\.signOut/u);
  assert.doesNotMatch(html, /supabase\s*\.\s*from\s*\(/u);
  assert.doesNotMatch(html, /\/rest\/v1\/training_notes/u);
});

test('server APIs enforce stage 8 default-deny resource scope and retain owner checks', async () => {
  const collection = await read('../api/notes.js');
  const item = await read('../api/notes/[id].js');
  const decider = await read('../src/decider.mjs');
  const runtime = await read('../src/notes-runtime.mjs');
  assert.match(collection, /authenticateStudent/u);
  assert.match(collection, /RESOURCE_SCOPE_REQUIRED/u);
  assert.match(item, /authenticateStudent/u);
  assert.match(item, /isProvisionedNoteRequest\(request\.method, id\)/u);
  assert.match(item, /\.eq\('id', id\)\.eq\('owner_id', context\.identity\.userId\)/u);
  assert.match(decider, /PROVISIONED_NOTE_API_ID/u);
  assert.match(runtime, /process\.env\.SUPABASE_SECRET_KEY/u);
  assert.doesNotMatch(runtime, /SUPABASE_PUBLISHABLE_KEY/u);
});

test('stage 5 source URL is query-free HTTPS and route allowlist is present', async () => {
  const config = JSON.parse(await read('../aleph.config.json'));
  assert.ok(config.step >= 5, 'stage 5 source API config remains available in later stages');
  assert.equal(config.originalApiUrl, 'https://hjuczlxovnghkljzygoz.supabase.co/rest/v1/training_notes');
  const source = new URL(config.originalApiUrl);
  assert.equal(source.protocol, 'https:');
  assert.equal(source.search, '');
  assert.equal(source.hash, '');
  assert.equal(source.pathname, '/rest/v1/training_notes');
  assert.ok(Array.isArray(config.allowedRoutes) && config.allowedRoutes.length > 0);
  assert.deepEqual(config.allowedRoutes, [
    'GET /api/notes/:id',
    'PUT /api/notes/:id',
    'GET /api/announcements/:id',
    'PUT /api/announcements/:id',
    'GET /api/notices/:id',
    'PUT /api/notices/:id',
  ]);
});

test('permission SQL revokes direct privileges only from the training_notes table', async () => {
  const sql = await read('../supabase/stage5-training-notes-direct-access.sql');
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE public\.training_notes FROM PUBLIC, anon, authenticated;/iu);
  assert.match(sql, /has_table_privilege/u);
  assert.doesNotMatch(sql, /\bGRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)\b/iu);
  const relations = [...sql.matchAll(/\bpublic\.([a-z_][a-z0-9_]*)/giu)].map(match => match[1]);
  assert.ok(relations.length > 0);
  assert.deepEqual([...new Set(relations)], ['training_notes']);
});

test('first HTML response keeps anti-sniffing and CSP headers configured', async () => {
  const vercel = JSON.parse(await read('../vercel.json'));
  const headers = vercel.headers.flatMap(entry => entry.headers);
  assert.ok(headers.some(header => header.key.toLowerCase() === 'x-content-type-options'
    && header.value.toLowerCase() === 'nosniff'));
  assert.ok(headers.some(header => header.key.toLowerCase() === 'content-security-policy'));
});
