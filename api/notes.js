import { randomUUID } from 'node:crypto';
import { authenticateStudent } from '../src/notes-runtime.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function bodyObject(request) {
  if (request.body && typeof request.body === 'object' && !Array.isArray(request.body)) {
    return request.body;
  }
  if (typeof request.body === 'string') {
    try {
      const parsed = JSON.parse(request.body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function present(note) {
  return { id: note.id, title: note.title, body: note.content };
}

export function createCollectionHandler(authenticate = authenticateStudent) {
  return async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');

  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const context = await authenticate(request, response);
  if (!context) return;

  if (request.method === 'GET') {
    try {
      const { data, error } = await context.supabase
        .from('training_notes')
        .select('id,title,content')
        .eq('owner_id', context.identity.userId)
        .order('created_at', { ascending: true })
        .limit(100);
      if (error || !Array.isArray(data)) {
        return response.status(503).json({ error: 'NOTES_UNAVAILABLE' });
      }
      return response.status(200).json({ notes: data.map(present) });
    } catch {
      return response.status(503).json({ error: 'NOTES_UNAVAILABLE' });
    }
  }

  const input = bodyObject(request);
  if (!input || typeof input.title !== 'string' || typeof input.body !== 'string'
      || !input.title.trim() || input.title.trim().length > 120 || input.body.length > 2000) {
    return response.status(400).json({
      error: 'INVALID_NOTE',
      message: '제목은 1~120자, 본문은 2,000자 이하로 입력해 주세요.',
    });
  }

  const generatedId = input.id === undefined || input.id === null || input.id === '';
  const id = generatedId ? randomUUID() : input.id;
  if (typeof id !== 'string' || !UUID.test(id)) {
    return response.status(400).json({ error: 'INVALID_NOTE_ID' });
  }

  try {
    const { data, error } = await context.supabase
      .from('training_notes')
      .insert({
        id,
        owner_id: context.identity.userId,
        title: input.title.trim(),
        content: input.body,
      })
      .select('id,title,content')
      .single();

    if (error?.code === '23505') {
      return response.status(409).json({
        error: 'NOTE_CONFLICT',
        message: '같은 제목의 메모가 이미 있습니다. 다른 제목을 사용해 주세요.',
      });
    }
    if (error || !data) {
      return response.status(503).json({ error: 'NOTES_UNAVAILABLE' });
    }

    return response.status(201).json(generatedId ? { id: data.id } : present(data));
  } catch {
    return response.status(503).json({ error: 'NOTES_UNAVAILABLE' });
  }
  };
}

export default createCollectionHandler();
