const SECRET_VALUE = /(?:bearer\s+)[A-Za-z0-9._~+/-]+|(?:api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/ig;
function redact(value) {
  if (typeof value !== 'string') return value;
  return value.replace(SECRET_VALUE, '[REDACTED]').replace(/\b[A-Fa-f0-9]{32,}\b/g, '[REDACTED]');
}
export function readAlerts(fixture) {
  if (!fixture || fixture.schema !== 'aleph.xdr.fixture.v1' || !Array.isArray(fixture.alerts)) throw new TypeError('잘못된 Wazuh 경보 묶음입니다.');
  return fixture.alerts.map(alert => ({
    timestamp: redact(String(alert?.timestamp ?? '')),
    sourceAddress: redact(String(alert?.data?.srcip ?? '')),
    account: redact(String(alert?.data?.srcuser ?? '')),
    ruleLevel: Number.isFinite(alert?.rule?.level) ? alert.rule.level : null,
    description: redact(String(alert?.rule?.description ?? '')).slice(0, 500)
  }));
}
