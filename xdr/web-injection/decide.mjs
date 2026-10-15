// Standalone detector for web-injection alerts. No imports, filesystem, or network access.
const PATTERNS = Object.freeze({
  repeated_sql_injection: Object.freeze({
    name: 'repeated_sql_injection',
    conditions: Object.freeze({ marker: /SQL 구문|SQL 표식|데이터베이스 조회를 이어 붙이는/u, minimumCount: 8, minimumLevel: 10 }),
    evidence: 'MITRE ATT&CK T1190: repeated SQL injection indicators in requests to a public-facing application.',
  }),
  repeated_script_injection: Object.freeze({
    name: 'repeated_script_injection',
    conditions: Object.freeze({ marker: /스크립트 삽입 표기|스크립트 표식/u, minimumCount: 8, minimumLevel: 10 }),
    evidence: 'MITRE ATT&CK T1190: repeated script-injection indicators in requests to a public-facing application.',
  }),
  repeated_path_traversal: Object.freeze({
    name: 'repeated_path_traversal',
    conditions: Object.freeze({ marker: /경로를 여러 단계 거슬러|경로 이탈 표기/u, minimumCount: 8, minimumLevel: 10 }),
    evidence: 'MITRE ATT&CK T1190: repeated path traversal attempts targeting a public-facing application.',
  }),
  repeated_command_separator: Object.freeze({
    name: 'repeated_command_separator',
    conditions: Object.freeze({ marker: /명령 구분자 표기/u, minimumCount: 8, minimumLevel: 10 }),
    evidence: 'MITRE ATT&CK T1190: repeated command-separator indicators in requests to a public-facing application.',
  }),
  ambiguous_injection: Object.freeze({
    name: 'ambiguous_injection',
    conditions: Object.freeze({ marker: /주입처럼 보이는 표기|이상한 검색|구분 문자가/u, minimumCount: 1 }),
    evidence: 'MITRE ATT&CK T1190 supports investigating suspicious public-facing application requests, but a single ambiguous indicator is not enough to confirm an attack.',
  }),
});

function countOf(alert) {
  const raw = alert?.data?.count;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  if (typeof raw === 'string' && /^\d+$/u.test(raw)) return Number(raw);
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const match = description.match(/(\d+)번|연속 요청\s*(\d+)번/u);
  return match ? Number(match[1] ?? match[2]) : 1;
}

function decision(confidence, reason) {
  return {
    action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record',
    confidence,
    reason,
  };
}

export function decide(alert) {
  const description = typeof alert?.rule?.description === 'string'
    ? alert.rule.description.replace(/[\r\n\u0000-\u001f]/gu, ' ').slice(0, 500)
    : '';
  const level = Number.isInteger(alert?.rule?.level) ? alert.rule.level : 0;
  const count = countOf(alert);
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const tagged = mitre.includes('T1190');

  if (!description) return decision(0.1, 'no_injection_pattern');

  // A known indicator repeated from the same source at a high Wazuh level is clear.
  if (tagged) {
    for (const pattern of [
      PATTERNS.repeated_sql_injection,
      PATTERNS.repeated_script_injection,
      PATTERNS.repeated_path_traversal,
      PATTERNS.repeated_command_separator,
    ]) {
      if (pattern.conditions.marker.test(description)
          && count >= pattern.conditions.minimumCount
          && level >= pattern.conditions.minimumLevel
          && typeof alert?.data?.srcip === 'string'
          && alert.data.srcip.length > 0) {
        return decision(0.95, pattern.name);
      }
    }

    if (PATTERNS.ambiguous_injection.conditions.marker.test(description)) {
      return decision(0.65, PATTERNS.ambiguous_injection.name);
    }

    // Single benign words such as "select", "script", "SQL", or "up" are not attacks.
    if (/따옴표가 한 번|수업명|수업 단어|반복은 없습니다|공격 표기는 없습니다|삽입 표식은 아닙니다/u.test(description)) {
      return decision(0.1, 'benign_single_term');
    }
  }

  return decision(0.05, 'no_injection_pattern');
}
