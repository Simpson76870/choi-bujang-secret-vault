// 심판은 이 파일 하나만 인터넷 없는 격리 환경에서 불러옵니다.
const PATTERNS = Object.freeze({
  sql_injection: Object.freeze({
    name: 'sql_injection', conditions: Object.freeze({ repeatCountAtLeast: 8, ruleLevelAtLeast: 10 }),
    evidence: 'MITRE ATT&CK T1190: 공개 웹 앱 입력의 반복 SQL·명령 구문은 취약점 악용 신호이다.',
  }),
  script_injection: Object.freeze({
    name: 'script_injection', conditions: Object.freeze({ repeatCountAtLeast: 8, ruleLevelAtLeast: 10 }),
    evidence: 'MITRE ATT&CK T1190: 공개 웹 앱 입력의 반복 실행 스크립트 표기는 취약점 악용 신호이다.',
  }),
  path_traversal: Object.freeze({
    name: 'path_traversal', conditions: Object.freeze({ repeatCountAtLeast: 8, ruleLevelAtLeast: 10 }),
    evidence: 'MITRE ATT&CK T1190: 반복되는 상위 경로 요청은 공개 웹 앱의 경로 처리 취약점 악용 신호이다.',
  }),
});

function integer(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function output(confidence, reason) {
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record', confidence, reason };
}

function patternName(description) {
  if (/경로.*(?:거슬러|이탈)|\.\.\//.test(description)) return PATTERNS.path_traversal.name;
  if (/스크립트.*(?:삽입|표식|태그)/.test(description)) return PATTERNS.script_injection.name;
  if (/SQL.*(?:구문|표식)|데이터베이스.*(?:조회|연결)|명령 구분자/.test(description)) {
    return PATTERNS.sql_injection.name;
  }
  return null;
}

// 외부 모듈·파일·패키지·환경 변수·네트워크 없이 경보 한 건을 즉시 판정합니다.
export function decide(alert) {
  const timestamp = Date.parse(alert?.timestamp);
  const level = alert?.rule?.level;
  const description = typeof alert?.rule?.description === 'string'
    ? alert.rule.description.replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, 500) : '';
  const sourceAddress = alert?.data?.srcip;
  if (!Number.isFinite(timestamp) || !Number.isInteger(level) || level < 0 || level > 15
    || typeof sourceAddress !== 'string' || sourceAddress.length === 0) {
    return output(0.6, 'web_injection');
  }

  const count = Math.max(integer(alert?.data?.count), integer(description.match(/(\d+)번/)?.[1]),
    integer(description.match(/(\d+)건/)?.[1]));
  const pattern = patternName(description);
  if (pattern && level >= PATTERNS[pattern].conditions.ruleLevelAtLeast
    && count >= PATTERNS[pattern].conditions.repeatCountAtLeast && /반복|연속|번/.test(description)) {
    return output(pattern === 'sql_injection' && /스크립트/.test(description) ? 0.97 : 0.95, pattern);
  }
  if (level <= 3 && !pattern) return output(0.1, 'no_attack_pattern');
  return output(0.6, pattern ?? 'web_injection');
}
