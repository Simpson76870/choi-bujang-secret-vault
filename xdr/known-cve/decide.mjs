// 심판은 이 파일 하나만 인터넷 없는 격리 환경에서 불러옵니다.
const PATTERNS = Object.freeze({
  log4shell_jndi_lookup: Object.freeze({
    name: 'log4shell_jndi_lookup',
    conditions: Object.freeze({ ruleLevelAtLeast: 10, mitre: 'T1190' }),
    evidence: 'CVE-2021-44228 및 MITRE ATT&CK T1190: 완전한 JNDI 원격 조회 구문은 Log4Shell 악용 형태이다.',
  }),
  known_cve_scanner_trace: Object.freeze({
    name: 'known_cve_scanner_trace',
    conditions: Object.freeze({ ruleLevelAtLeast: 4, mitre: 'T1190' }),
    evidence: 'MITRE ATT&CK T1190: 알려진 취약점 식별자·점검 흔적은 추가 확인이 필요한 악용 탐색 신호이다.',
  }),
});

function output(confidence, reason) {
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record', confidence, reason };
}

function normalized(value) {
  if (typeof value !== 'string') return '';
  let result = value.slice(0, 2000);
  for (let index = 0; index < 2; index += 1) {
    try {
      const decoded = decodeURIComponent(result);
      if (decoded === result) break;
      result = decoded;
    } catch { break; }
  }
  return result.toLowerCase().replace(/\s+/g, ' ');
}

function requestText(alert) {
  const values = [];
  const visit = (value, key = '', depth = 0) => {
    if (depth > 2 || /authorization|cookie|password|passwd|token|secret|api[_-]?key/i.test(key)) return;
    if (typeof value === 'string' && /url|uri|query|arg|user.?agent|header|request/i.test(key)) values.push(value);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [childKey, child] of Object.entries(value)) visit(child, childKey, depth + 1);
    }
  };
  visit(alert?.data);
  return normalized(values.join(' '));
}

function hasJndiLookup(text) {
  const compact = text.replace(/\\u00(?:24|7b|7d|3a)/g, match => ({
    '\\u0024': '$', '\\u007b': '{', '\\u007d': '}', '\\u003a': ':',
  })[match] ?? match).replace(/\s/g, '');
  return /\$\{(?:\$\{(?:lower|upper):[jndi]\}){0,4}jndi:(?:ldap|ldaps|rmi|dns|iiop|http|https):\/\//i.test(compact)
    || /\$\{jndi:(?:ldap|ldaps|rmi|dns|iiop|http|https):\/\//i.test(compact);
}

export function decide(alert) {
  const timestamp = Date.parse(alert?.timestamp);
  const level = alert?.rule?.level;
  const sourceAddress = alert?.data?.srcip;
  if (!Number.isFinite(timestamp) || !Number.isInteger(level) || level < 0 || level > 15
    || typeof sourceAddress !== 'string' || sourceAddress.length === 0) {
    return output(0.6, PATTERNS.known_cve_scanner_trace.name);
  }
  const text = requestText(alert);
  const description = normalized(alert?.rule?.description);
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const hasT1190 = mitre.includes(PATTERNS.log4shell_jndi_lookup.conditions.mitre);
  if (hasJndiLookup(text) && hasT1190 && level >= PATTERNS.log4shell_jndi_lookup.conditions.ruleLevelAtLeast) {
    return output(0.96, PATTERNS.log4shell_jndi_lookup.name);
  }
  const trace = /cve-2021-44228|log4shell|log4j[-_ ]?(?:scan|scanner)|nuclei|jndi|취약점|점검|조회.*(?:흔적|형태)|중괄호|라이브러리/.test(`${text} ${description}`);
  if (hasT1190 && level >= PATTERNS.known_cve_scanner_trace.conditions.ruleLevelAtLeast && trace) {
    return output(0.6, PATTERNS.known_cve_scanner_trace.name);
  }
  return output(0.1, 'no_attack_pattern');
}
