import assert from 'node:assert/strict';
import { test } from 'node:test';
import itemHandlerModule, { createItemHandler } from '../api/notes/[id].js';
import announcementHandlerModule, { createAnnouncementItemHandler } from '../api/announcements/[id].js';
const USER_A = '00000000-0000-4000-8000-000000000001';
const USER_B = '00000000-0000-4000-8000-000000000002';
const NOTE_ID = '10000000-0000-4000-8000-000000000099';
const NOTE_B_ID = '10000000-0000-4000-8000-000000000100';
const ANNOUNCEMENT_ID = '20000000-0000-4000-8000-000000000099';
const DRAFT_ID = '20000000-0000-4000-8000-000000000100';
function responseRecorder() {
  return {
    headers: new Map(), statusCode: 0, payload: undefined,
    setHeader(name, value) { this.headers.set(name.toLowerCase(), value); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}
function memorySupabase({ notes = [], announcements = [] } = {}) {
  const queries = [];
  const tables = { training_notes: notes.map(row => ({ ...row })),
    training_announcements: announcements.map(row => ({ ...row })) };
  return {
    queries, tables,
    from(table) {
      assert.ok(tables[table], 'unexpected table: ' + table);
      const query = {
        table, operation: 'select', filters: [], payload: null,
        select(columns) { this.columns = columns; return this; },
        eq(field, value) { this.filters.push([field, value]); return this; },
        update(payload) { this.operation = 'update'; this.payload = { ...payload }; return this; },
        matchingRows() { return tables[table].filter(row => this.filters.every(([field, value]) => row[field] === value)); },
        async maybeSingle() {
          const found = this.matchingRows()[0];
          queries.push({ table, operation: this.operation, filters: [...this.filters], payload: this.payload });
          if (!found) return { data: null, error: null };
          if (this.operation === 'update') Object.assign(found, this.payload);
          return { data: { ...found }, error: null };
        },
      };
      return query;
    },
  };
}
function authenticatedAs(userId, supabase) { return async () => ({ identity: { kind: 'student', userId }, supabase }); }
const makeNote = (id, owner_id) => ({ id, owner_id, title: '가상 메모', content: '가상 본문', created_at: '2026-01-01T00:00:00Z' });
const makeAnnouncement = (id, instructor_id, published = true) => ({
  id, instructor_id, class_id: '30000000-0000-4000-8000-000000000001',
  title: '가상 공지', content: '가상 공지 본문', published,
});
async function invokeNote({ method, requester, notes, url, query, body }) {
  const supabase = memorySupabase({ notes });
  const response = responseRecorder();
  await createItemHandler(authenticatedAs(requester, supabase))({ method, url, query, headers: {}, body }, response);
  return { response, supabase };
}
async function invokeAnnouncement({ method, requester, announcements, url, query, body }) {
  const supabase = memorySupabase({ announcements });
  const response = responseRecorder();
  await createAnnouncementItemHandler(authenticatedAs(requester, supabase))({ method, url, query, headers: {}, body }, response);
  return { response, supabase };
}
test('note owner reads and edits own note; saved owner cannot be forged in body', async () => {
  const notes = [makeNote(NOTE_ID, USER_A)];
  const read = await invokeNote({ method: 'GET', requester: USER_A, notes, url: '/api/notes/' + NOTE_ID });
  assert.equal(read.response.statusCode, 200);
  assert.equal(read.response.payload.id, NOTE_ID);
  const edit = await invokeNote({ method: 'PUT', requester: USER_A, notes, url: '/api/notes/' + NOTE_ID,
    body: { title: 'A의 수정', body: '수정 본문', owner_id: USER_B, role: 'teacher' } });
  assert.equal(edit.response.statusCode, 200);
  assert.equal(edit.response.payload.title, 'A의 수정');
  assert.equal(edit.supabase.tables.training_notes[0].owner_id, USER_A);
  assert.ok(edit.supabase.queries.some(q => q.filters.some(([field, value]) => field === 'owner_id' && value === USER_A)));
});
test('B cannot fetch A note; query id cannot override the resource ID in the path', async () => {
  const notes = [makeNote(NOTE_ID, USER_A), makeNote(NOTE_B_ID, USER_B)];
  const result = await invokeNote({ method: 'GET', requester: USER_B, notes, url: '/api/notes/' + NOTE_ID, query: { id: NOTE_B_ID } });
  assert.equal(result.response.statusCode, 404);
  assert.deepEqual(result.response.payload, { error: 'NOTE_NOT_FOUND' });
  assert.equal(result.supabase.queries[0].filters.find(([field]) => field === 'id')[1], NOTE_ID);
  assert.equal(result.supabase.tables.training_notes[0].content, '가상 본문');
});
test('non-instructor cannot edit a published announcement by forging role/instructor_id in body', async () => {
  const announcements = [makeAnnouncement(ANNOUNCEMENT_ID, USER_A)];
  const result = await invokeAnnouncement({ method: 'PUT', requester: USER_B, announcements,
    url: '/api/announcements/' + ANNOUNCEMENT_ID,
    body: { title: '위조 수정', body: '변경하면 안 됨', role: 'teacher', instructor_id: USER_B } });
  assert.equal(result.response.statusCode, 403);
  assert.deepEqual(result.response.payload, { error: 'INSTRUCTOR_REQUIRED' });
  assert.equal(result.supabase.tables.training_announcements[0].title, '가상 공지');
  assert.equal(result.supabase.tables.training_announcements[0].instructor_id, USER_A);
});
test('stored instructor can edit own announcement and update is owner-filtered', async () => {
  const announcements = [makeAnnouncement(ANNOUNCEMENT_ID, USER_A)];
  const result = await invokeAnnouncement({ method: 'PUT', requester: USER_A, announcements,
    url: '/api/announcements/' + ANNOUNCEMENT_ID,
    body: { title: '바뀐 공지', body: '새 공지 본문', role: 'student', instructor_id: USER_B } });
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.payload.title, '바뀐 공지');
  assert.equal(result.supabase.tables.training_announcements[0].instructor_id, USER_A);
  assert.ok(result.supabase.queries.some(q => q.operation === 'update'
    && q.filters.some(([field, value]) => field === 'instructor_id' && value === USER_A)));
});
test('published announcements may be read, drafts are visible only to their instructor', async () => {
  const rows = [makeAnnouncement(ANNOUNCEMENT_ID, USER_A, true), makeAnnouncement(DRAFT_ID, USER_A, false)];
  const published = await invokeAnnouncement({ method: 'GET', requester: USER_B, announcements: rows, url: '/api/announcements/' + ANNOUNCEMENT_ID });
  assert.equal(published.response.statusCode, 200);
  const draft = await invokeAnnouncement({ method: 'GET', requester: USER_B, announcements: rows, url: '/api/announcements/' + DRAFT_ID });
  assert.equal(draft.response.statusCode, 404);
  const teacherDraft = await invokeAnnouncement({ method: 'GET', requester: USER_A, announcements: rows, url: '/api/announcements/' + DRAFT_ID });
  assert.equal(teacherDraft.response.statusCode, 200);
});
test('announcement ID is extracted from path, not query parameter', async () => {
  const rows = [makeAnnouncement(ANNOUNCEMENT_ID, USER_A), makeAnnouncement(DRAFT_ID, USER_A)];
  const result = await invokeAnnouncement({ method: 'GET', requester: USER_B, announcements: rows,
    url: '/api/announcements/' + ANNOUNCEMENT_ID, query: { id: DRAFT_ID } });
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.payload.id, ANNOUNCEMENT_ID);
  assert.equal(result.supabase.queries[0].filters.find(([field]) => field === 'id')[1], ANNOUNCEMENT_ID);
});
test('resource IDs accept either canonical service-local or public API path', async () => {
  const notes = [makeNote(NOTE_ID, USER_A)];
  const localPath = await invokeNote({ method: 'GET', requester: USER_A, notes, url: '/notes/' + NOTE_ID });
  assert.equal(localPath.response.statusCode, 200);
  const apiPath = await invokeNote({ method: 'GET', requester: USER_A, notes, url: '/api/notes/' + NOTE_ID });
  assert.equal(apiPath.response.statusCode, 200);
  const announcements = [makeAnnouncement(ANNOUNCEMENT_ID, USER_A)];
  const announcement = await invokeAnnouncement({ method: 'GET', requester: USER_B, announcements, url: '/announcements/' + ANNOUNCEMENT_ID });
  assert.equal(announcement.response.statusCode, 200);
});

test('new routes are callable and API IDs reject feature-shaped paths', async () => {
  assert.equal(typeof itemHandlerModule, 'function');
  assert.equal(typeof announcementHandlerModule, 'function');
  const supabase = memorySupabase({ notes: [makeNote(NOTE_ID, USER_A)] });
  const response = responseRecorder();
  await createItemHandler(authenticatedAs(USER_A, supabase))({ method: 'GET', url: '/api/notes/export' }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.payload.error, 'INVALID_NOTE_ID');
});
