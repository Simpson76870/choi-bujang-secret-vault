import { authenticateStudent } from '../src/notes-runtime.mjs';

export function createCollectionHandler(authenticate = authenticateStudent) {
  return async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Vary', 'Authorization');

    if (!['GET', 'POST'].includes(request.method)) {
      response.setHeader('Allow', 'GET, POST');
      return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    const context = await authenticate(request, response);
    if (!context) return;

    // Stage 8 deliberately has no collection resource binding. Returning a
    // user's entire note list would bypass the per-resource zone decision.
    return response.status(403).json({ error: 'RESOURCE_SCOPE_REQUIRED' });
  };
}

export default createCollectionHandler();
