import { authenticateStudent } from '../../src/notes-runtime.mjs';
import { getRecoveryAuditForOwner } from '../../src/recovery/ledger.mjs';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Vary', 'Authorization');

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const context = await authenticateStudent(request, response);
  if (!context) return;
  const events = getRecoveryAuditForOwner(context.identity.userId);
  return response.status(200).json({
    schema: 'aleph.note-audit.v1',
    events,
    storage: 'process_local_append_only',
  });
}
