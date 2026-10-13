import { authenticateStudent } from '../../src/notes-runtime.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
function bodyObject(request) {
  if (request.body && typeof request.body === 'object' && !Array.isArray(request.body)) return request.body;
  if (typeof request.body === 'string') {
    try { const parsed = JSON.parse(request.body); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null; }
    catch { return null; }
  }
  return null;
}
function announcementId(request) {
  try {
    const pathname = new URL(request.url, 'https://invalid.local').pathname;
    const match = /^(?:\/api)?\/announcements\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/iu.exec(pathname);
    return match?.[1] ?? '';
  } catch { return ''; }
}
function present(row) { return { id: row.id, title: row.title, body: row.content }; }
function missing(response) { return response.status(404).json({ error: 'ANNOUNCEMENT_NOT_FOUND' }); }
export function createAnnouncementItemHandler(authenticate = authenticateStudent) {
  return async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (!['GET', 'PUT'].includes(request.method)) {
      response.setHeader('Allow', 'GET, PUT');
      return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }
    const context = await authenticate(request, response);
    if (!context) return;
    const id = announcementId(request);
    if (!UUID.test(id)) return response.status(400).json({ error: 'INVALID_ANNOUNCEMENT_ID' });
    try {
      const { data: current, error: readError } = await context.supabase
        .from('training_announcements').select('id,title,content,instructor_id,published').eq('id', id).maybeSingle();
      if (readError) return response.status(503).json({ error: 'ANNOUNCEMENTS_UNAVAILABLE' });
      if (!current) return missing(response);
      if (request.method === 'GET') {
        const isInstructor = current.instructor_id === context.identity.userId;
        if (!current.published && !isInstructor) return missing(response);
        return response.status(200).json(present(current));
      }
      // Verified Supabase identity is authoritative; body role/instructor_id are ignored.
      if (current.instructor_id !== context.identity.userId) {
        return response.status(403).json({ error: 'INSTRUCTOR_REQUIRED' });
      }
      const input = bodyObject(request);
      if (!input || typeof input.title !== 'string' || typeof input.body !== 'string'
          || !input.title.trim() || input.title.trim().length > 120 || input.body.length > 3000) {
        return response.status(400).json({ error: 'INVALID_ANNOUNCEMENT',
          message: '제목은 1~120자, 본문은 3,000자 이하로 입력해 주세요.' });
      }
      const { data, error } = await context.supabase
        .from('training_announcements')
        .update({ title: input.title.trim(), content: input.body, updated_at: new Date().toISOString() })
        .eq('id', id).eq('instructor_id', context.identity.userId)
        .select('id,title,content,instructor_id,published').maybeSingle();
      if (error) return response.status(503).json({ error: 'ANNOUNCEMENTS_UNAVAILABLE' });
      if (!data) return response.status(403).json({ error: 'INSTRUCTOR_REQUIRED' });
      return response.status(200).json(present(data));
    } catch {
      return response.status(503).json({ error: 'ANNOUNCEMENTS_UNAVAILABLE' });
    }
  };
}
export default createAnnouncementItemHandler();
