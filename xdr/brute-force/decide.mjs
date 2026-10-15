// Self-contained brute-force detector for the offline judge.
// Keep the patterns here: this file must run without imports, filesystem access, or network.
const PATTERNS = Object.freeze([
  {
    name: 'rapid_same_source_failures',
    condition: 'T1110 plus at least 20 failures reported within a short window from one source',
    evidence: 'MITRE ATT&CK T1110 covers brute-force attempts; the fixture explicitly reports high-volume failures from the same source.',
  },
  {
    name: 'password_spraying',
    condition: 'T1110 and the description reports the same password attempted across multiple accounts, or repeated failures across at least 15 accounts',
    evidence: 'MITRE ATT&CK T1110 includes password spraying, which tests a password across multiple accounts.',
  },
  {
    name: 'ambiguous_login_failures',
    condition: 'Login failures are present but the volume or context is insufficient to confirm a brute-force attack',
    evidence: 'MITRE ATT&CK T1110 describes brute-force behavior, but a small number of failures alone does not establish an attack.',
  },
]);

const ATTACK_ID = 'T1110';
const SUCCESS_OR_ROUTINE = /로그인이 성공|로그아웃|로그인 상태가 유지|세션 유지를 확인|자료실 화면이 열렸|비밀번호 변경이 성공/u;
const LOGIN_FAILURE = /로그인 실패|비밀번호 실패|비밀번호를 .*넣|로그인 .*실패/u;
const SPRAY = /같은 비밀번호|여러 계정|계정 \d+개|계정 이름을 바꿔|같은 간격/u;

function result(action, confidence, reason) {
  return { action, confidence, reason };
}

export function decide(alert) {
  if (!alert || typeof alert !== 'object' || Array.isArray(alert)) {
    return result('record', 0, '유효한 경보 객체가 아님');
  }

  const description = typeof alert.rule?.description === 'string' ? alert.rule.description : '';
  const level = Number.isFinite(alert.rule?.level) ? alert.rule.level : 0;
  const mitre = Array.isArray(alert.rule?.mitre) ? alert.rule.mitre : [];
  const source = typeof alert.data?.srcip === 'string' ? alert.data.srcip : '';
  const account = typeof alert.data?.srcuser === 'string' ? alert.data.srcuser : '';
  const rawCount = alert.data?.count;
  const count = typeof rawCount === 'number' ? rawCount
    : typeof rawCount === 'string' && /^\d+$/u.test(rawCount) ? Number(rawCount) : 0;
  const hasT1110 = mitre.includes(ATTACK_ID);
  const failed = LOGIN_FAILURE.test(description);
  const routine = SUCCESS_OR_ROUTINE.test(description);

  // Successful logins/logout/session messages are not themselves grounds for blocking.
  if (routine && !failed) {
    return result('record', 0.05, '정상 로그인·세션 활동');
  }

  // Block only explicit, high-volume T1110 signals. A source and account must be present.
  if (hasT1110 && source && account && failed && count >= 20 && level >= 10) {
    if (SPRAY.test(description)) {
      return result('block', 0.99, 'password_spraying');
    }
    return result('block', 0.96, 'rapid_same_source_failures');
  }

  // A clear password-spraying description is strong even if count is encoded differently.
  if (hasT1110 && source && account && SPRAY.test(description)
      && /같은 비밀번호|여러 계정|계정 \d+개/u.test(description) && level >= 10) {
    return result('block', 0.90, 'password_spraying');
  }

  if (hasT1110 && failed) {
    if (count >= 3 || /평소와 다른 주소|잠금 뒤|그 뒤 성공|뒤에 성공|성공은 없습니다/u.test(description)) {
      return result('alert', 0.65, 'ambiguous_login_failures');
    }
    return result('record', 0.25, '로그인 실패 증거가 부족함');
  }

  return result('record', 0.05, '무차별 로그인 공격 근거 없음');
}
