// Self-contained brute-force detector for the offline judge.
// Pattern definitions are constants in this file: no imports, filesystem access, or network.
const PATTERNS = Object.freeze({
  repeated_password_guessing: Object.freeze({
    name: 'repeated_password_guessing',
    conditions: Object.freeze({ failureCountAtLeast: 30, ruleLevelAtLeast: 10, requiresFailureDescription: true }),
    evidence: 'MITRE ATT&CK T1110: repeated password guessing and high-volume authentication failures are brute-force signals.',
  }),
  password_spraying: Object.freeze({
    name: 'password_spraying',
    conditions: Object.freeze({ accountCountAtLeast: 5, massAccountCountAtLeast: 10, ruleLevelAtLeast: 10, requiresFailureDescription: true }),
    evidence: 'MITRE ATT&CK T1110/T1110.003: trying the same password across multiple accounts is password spraying.',
  }),
});

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function describedNumber(description, expression) {
  return nonNegativeInteger(description.match(expression)?.[1]);
}

function accountCount(alert, description) {
  const accounts = typeof alert?.data?.accounts === 'string'
    ? alert.data.accounts.split(',').map(value => value.trim()).filter(value => /^user\d{2,4}$/u.test(value))
    : [];
  return Math.max(
    new Set(accounts).size,
    describedNumber(description, /계정\s*(\d+)개/u),
    describedNumber(description, /서로 다른 계정\s*(\d+)개/u),
  );
}

function result(confidence, reason) {
  return {
    action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record',
    confidence,
    reason,
  };
}

// One alert in, one decision out. Never reads or writes files and never performs I/O.
export function decide(alert) {
  const timestamp = Date.parse(alert?.timestamp);
  const level = alert?.rule?.level;
  const description = typeof alert?.rule?.description === 'string'
    ? alert.rule.description.replace(/[\r\n\u0000-\u001f]/gu, ' ').slice(0, 500)
    : '';
  const sourceAddress = alert?.data?.srcip;
  const account = alert?.data?.srcuser;
  const fieldsValid = Number.isFinite(timestamp)
    && Number.isInteger(level) && level >= 0 && level <= 15
    && typeof sourceAddress === 'string' && sourceAddress.length > 0
    && typeof account === 'string' && account.length > 0;

  if (!fieldsValid) return result(0.6, 'repeated_password_guessing');

  const failure = /실패/u.test(description);
  const count = Math.max(
    nonNegativeInteger(alert?.data?.count),
    describedNumber(description, /실패(?:가|는)?\s*(\d+)건/u),
    describedNumber(description, /실패\s*(\d+)건/u),
  );
  const accounts = accountCount(alert, description);
  const spray = PATTERNS.password_spraying.conditions;
  const guessing = PATTERNS.repeated_password_guessing.conditions;
  const explicitSpray = /같은 비밀번호/u.test(description)
    && (accounts >= spray.accountCountAtLeast || /여러 계정|서로 다른 계정/u.test(description));
  const massAccountFailures = failure && accounts >= spray.massAccountCountAtLeast
    && /같은 주소|한 주소/u.test(description);

  // Block only clear, high-confidence T1110 patterns.
  if (level >= spray.ruleLevelAtLeast && (explicitSpray || massAccountFailures)) {
    return result(explicitSpray ? 0.96 : 0.9, 'password_spraying');
  }
  if (failure && level >= guessing.ruleLevelAtLeast && count >= guessing.failureCountAtLeast) {
    return result(0.95, 'repeated_password_guessing');
  }

  // Routine/low-volume events are records; ambiguous failures remain alerts, never blocks.
  if (level <= 3 && (!failure || count <= 1)) return result(0.1, 'no_attack_pattern');

  const reason = /계정.*(?:비밀번호|실패)|같은 비밀번호/u.test(description)
    ? 'password_spraying'
    : 'repeated_password_guessing';
  return result(0.6, reason);
}
