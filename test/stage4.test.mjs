import assert from 'node:assert/strict';
import { test } from 'node:test';
import collectionHandlerModule, { createCollectionHandler } from '../api/notes.js';
import itemHandlerModule, { createItemHandler } from '../api/notes/[id].js';

const USER_A = '00000000-0000-4000-8000-000000000001';
const USER_B = '00000000-0000-4000-8000-000000000002';
const NOTE_ID = '10000000-0000-4000-8000-000000000099';
const NEW_NOTE_ID = '10000000-0000-4000-8000-000000000100';

function responseRecorder() {
  return {
    headers: new Map(),
    statusCode: 0,
    payload: undefined,
    setHeader(name, value) { this.headers.set(name.toLowerCase(), value); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function memorySupabase(initialRows) {
  const rows = initialRows.map(row => ({ ...row }));
  const queries = [];
  const supabase = {
    rows,
    queries,
    from(table) {
      assert.equal(table, 'training_notes');
      const query = {
        operation: 'select',
        filters: [],
        selected: null,
        payload: null,
        inserted: null,
        select(columns) { this.selected = columns; return this; },
        eq(field, value) { this.filters.push([field, value]); return this; },
        order() { return this; },
        limit() { return this; },
        update(payload) {
          this.operation = 'update';
          this.payload = { ...payload };
          return this;
        },
        insert(payload) {
          this.operation = 'insert';
          this.inserted = { ...payload };
          return this;
        },
        delete() { this.operation = 'delete'; return this; },
        matchingRows() {
          return rows.filter(row => this.filters.every(([field, value]) => row[field] === value));
        },
        async maybeSingle() {
          if (this.operation === 'update') {
            queries.push({ operation: this.operation, filters: [...this.filters], payload: { ...this.payload } });
            const existing = this.matchingRows()[0];
            if (!existing) return { data: null, error: null };
            Object.assign(existing, this.payload);
            return { data: { ...existing }, error: null };
          }
          const existing = this.matchingRows()[0];
          queries.push({ operation: this.operation, filters: [...this.filters] });
          return { data: existing ? { ...existing } : null, error: null };
        },
        async single() {
          if (this.operation !== 'insert') throw new Error('unexpected single()');
          const inserted = { ...this.inserted, created_at: '2026-01-01T00:00:00Z' };
          rows.push(inserted);
          queries.push({ operation: this.operation, payload: { ...this.inserted } });
          return { data: { ...inserted }, error: null };
        },
        then(resolve, reject) {
          if (this.operation === 'delete') {
            const found = this.matchingRows();
            for (const row of found) rows.splice(rows.indexOf(row), 1);
            queries.push({ operation: this.operation, filters: [...this.filters] });
            return Promise.resolve({ data: found.map(row => ({ id: row.id })), error: null }).then(resolve, reject);
          }
          const found = this.matchingRows();
          queries.push({ operation: this.operation, filters: [...this.filters] });
          return Promise.resolve({ data: found.map(row => ({ ...row })), error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return supabase;
}

function authenticatedAs(userId, supabase) {
  return async () => ({ identity: { kind: 'student', userId }, supabase });
}

const makeNote = (id, owner_id, title = '가상 메모') => ({
  id, owner_id, title, content: '가상 본문', created_at: '2026-01-01T00:00:00Z',
});

async function invokeItem(method, requesterId, storedOwnerId, body) {
  const supabase = memorySupabase([makeNote(NOTE_ID, storedOwnerId)]);
  const response = responseRecorder();
  const handler = createItemHandler(authenticatedAs(requesterId, supabase));
  await handler({
    method,
    url: '/api/notes/' + NOTE_ID,
    query: { id: NOTE_ID },
    headers: {},
    body,
  }, response);
  return { response, supabase };
}

test('single-note GET denies a different owner even when the note ID is known', async () => {
  const { response, supabase } = await invokeItem('GET', USER_B, USER_A);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.payload, { error: 'NOTE_NOT_FOUND' });
  assert.ok(supabase.queries[0].filters.some(([field, value]) => field === 'owner_id' && value === USER_B));
});

test('single-note PUT denies another owner and does not alter the row', async () => {
  const { response, supabase } = await invokeItem('PUT', USER_B, USER_A, {
    title: '바꾸기 시도', body: '바뀌면 안 됨', owner_id: USER_A,
  });
  assert.equal(response.statusCode, 404);
  assert.equal(supabase.rows[0].title, '가상 메모');
  assert.equal(supabase.rows[0].owner_id, USER_A);
  assert.ok(supabase.queries[0].filters.some(([field, value]) => field === 'owner_id' && value === USER_B));
});

test('DELETE is outside the provisioned resource policy and leaves the row intact', async () => {
  const { response, supabase } = await invokeItem('DELETE', USER_B, USER_A);
  assert.equal(response.statusCode, 405);
  assert.equal(supabase.rows.length, 1);
  assert.equal(supabase.rows[0].owner_id, USER_A);
  assert.equal(supabase.queries.length, 0);
});

test('owner can read and edit the provisioned note, but cannot use an unscoped delete', async () => {
  const getResult = await invokeItem('GET', USER_B, USER_B);
  assert.equal(getResult.response.statusCode, 200);
  assert.deepEqual(Object.keys(getResult.response.payload).sort(), ['body', 'id', 'title']);

  const putResult = await invokeItem('PUT', USER_B, USER_B, {
    title: '바뀐 제목', body: '바뀐 본문', owner_id: USER_A,
  });
  assert.equal(putResult.response.statusCode, 200);
  assert.deepEqual(Object.keys(putResult.response.payload).sort(), ['body', 'id', 'title']);
  assert.equal(putResult.supabase.rows[0].title, '바뀐 제목');
  assert.equal(putResult.supabase.rows[0].owner_id, USER_B);
  assert.equal(putResult.supabase.queries[0].payload.owner_id, USER_B);
  assert.ok(putResult.supabase.queries[0].filters.some(([field, value]) => field === 'owner_id' && value === USER_B));

  const deleteResult = await invokeItem('DELETE', USER_B, USER_B);
  assert.equal(deleteResult.response.statusCode, 405);
  assert.equal(deleteResult.supabase.rows.length, 1);
  assert.equal(deleteResult.supabase.queries.length, 0);
});

test('POST is denied because collection creation has no registered resource scope', async () => {
  const supabase = memorySupabase([]);
  const response = responseRecorder();
  const handler = createCollectionHandler(authenticatedAs(USER_B, supabase));
  await handler({
    method: 'POST',
    url: '/api/notes',
    headers: {},
    body: { id: NEW_NOTE_ID, title: 'B의 메모', body: '가상 본문', owner_id: USER_A },
  }, response);

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.payload, { error: 'RESOURCE_SCOPE_REQUIRED' });
  assert.equal(supabase.rows.length, 0);
  assert.equal(supabase.queries.length, 0);
});

test('POST without a resource binding is default-denied even when the ID would be server-generated', async () => {
  const supabase = memorySupabase([]);
  const response = responseRecorder();
  const handler = createCollectionHandler(authenticatedAs(USER_B, supabase));
  await handler({
    method: 'POST',
    url: '/api/notes',
    headers: {},
    body: { title: '자동 ID 메모', body: '가상 본문', owner_id: USER_A },
  }, response);

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.payload, { error: 'RESOURCE_SCOPE_REQUIRED' });
  assert.equal(supabase.rows.length, 0);
  assert.equal(supabase.queries.length, 0);
});

test('collection GET is default-denied because a list has no exact resource binding', async () => {
  const supabase = memorySupabase([
    makeNote(NOTE_ID, USER_A, 'A 메모'),
    makeNote(NEW_NOTE_ID, USER_B, 'B 메모'),
  ]);
  const response = responseRecorder();
  const handler = createCollectionHandler(authenticatedAs(USER_B, supabase));
  await handler({ method: 'GET', url: '/api/notes', headers: {} }, response);

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.payload, { error: 'RESOURCE_SCOPE_REQUIRED' });
  assert.equal(supabase.queries.length, 0);
});

test('default Vercel route exports remain callable', () => {
  assert.equal(typeof collectionHandlerModule, 'function');
  assert.equal(typeof itemHandlerModule, 'function');
});
