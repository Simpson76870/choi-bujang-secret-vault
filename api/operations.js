import { getOperationsReport } from '../src/recovery/ledger.mjs';
import config from '../aleph.config.json' with { type: 'json' };

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const report = getOperationsReport();
  return response.status(200).json({
    ...report,
    step: config.step,
    restoreRoute: config.restoreRoute,
    auditHistory: {
      status: report.recoveryAuditEvents > 0 ? 'measured' : 'not_run',
      entries: report.recoveryAuditEvents,
      storage: 'process_local_append_only',
    },
  });
}
