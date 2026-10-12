import { createClient } from '@supabase/supabase-js';

const FIXTURE_OWNER_ID = '00000000-0000-4000-8000-000000000001';
const SAMPLE_MARKER = 'SAMPLE_NOTE_1';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (typeof supabaseUrl !== 'string' || !supabaseUrl.trim()
      || typeof secretKey !== 'string' || !secretKey.trim()) {
    return response.status(503).json({ error: 'NOTES_SERVICE_NOT_CONFIGURED' });
  }

  let url;
  try {
    url = new URL(supabaseUrl);
  } catch {
    return response.status(503).json({ error: 'NOTES_SERVICE_NOT_CONFIGURED' });
  }
  if (url.protocol !== 'https:' || url.username || url.password
      || url.search || url.hash) {
    return response.status(503).json({ error: 'NOTES_SERVICE_NOT_CONFIGURED' });
  }

  try {
    const supabase = createClient(url.toString(), secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data, error } = await supabase
      .from('training_notes')
      .select('title,content')
      .eq('owner_id', FIXTURE_OWNER_ID)
      .order('created_at', { ascending: true })
      .limit(5);

    if (error || !Array.isArray(data) || data.length !== 4
        || data.some(note => typeof note.title !== 'string'
          || typeof note.content !== 'string')) {
      return response.status(503).json({ error: 'NOTES_UNAVAILABLE' });
    }

    return response.status(200).json({ sampleMarker: SAMPLE_MARKER, notes: data });
  } catch {
    // Do not log request details, environment variables, key material, or data bodies.
    return response.status(503).json({ error: 'NOTES_UNAVAILABLE' });
  }
}
