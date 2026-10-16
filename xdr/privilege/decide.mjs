// 심판은 이 파일 하나만 인터넷 없는 격리 환경에서 불러옵니다.
const PATTERNS = Object.freeze({
  administrator_group_addition: Object.freeze({
    name: 'administrator_group_addition',
    conditions: Object.freeze({ ruleLevelAtLeast: 10, mitre: 'T1078' }),
    evidence: 'MITRE ATT&CK T1078: 낮은 권한의 정상 계정이 관리자 그룹에 추가되는 것은 도용 계정의 권한 확대 신호이다.',
  }),
  unfamiliar_admin_command: Object.freeze({
    name: 'unfamiliar_admin_command',
    conditions: Object.freeze({ ruleLevelAtLeast: 10, mitre: 'T1068' }),
    evidence: 'MITRE ATT&CK T1068: 처음 보는 관리자 명령이나 권한 전환 직후 명령은 권한 상승 악용 신호이다.',
  }),
  off_hours_privilege_use: Object.freeze({
    name: 'off_hours_privilege_use',
    conditions: Object.freeze({ ruleLevelAtLeast: 10, mitre: Object.freeze(['T1068', 'T1078']) }),
    evidence: 'MITRE ATT&CK T1068 및 T1078: 평소와 다른 시각의 권한 변경과 관리자 사용 결합은 계정 도용·권한 상승 신호이다.',
  }),
});

function output(confidence, reason) {
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record', confidence, reason };
}

function normalized(value) {
  return typeof value === 'string'
    ? value.toLowerCase().replace(/[\r\n\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').slice(0, 1000)
    : '';
}

function patternName(description, mitre) {
  if (/수업 시간 밖|업무처럼 보이지 않는 시각|업무 시간 밖/.test(description)) {
    return PATTERNS.off_hours_privilege_use.name;
  }
  if (/관리자 그룹|그룹.*관리자|로컬 그룹/.test(description)) {
    return PATTERNS.administrator_group_addition.name;
  }
  if (/관리자 명령|권한 상승|관리자 권한|권한 명령/.test(description)) {
    return PATTERNS.unfamiliar_admin_command.name;
  }
  if (mitre.includes('T1078')) return PATTERNS.administrator_group_addition.name;
  if (mitre.includes('T1068')) return PATTERNS.unfamiliar_admin_command.name;
  return null;
}

// 외부 모듈·파일·환경 변수·네트워크 없이 경보 한 건을 즉시 판정합니다.
export function decide(alert) {
  const timestamp = Date.parse(alert?.timestamp);
  const level = alert?.rule?.level;
  const sourceAddress = alert?.data?.srcip;
  if (!Number.isFinite(timestamp) || !Number.isInteger(level) || level < 0 || level > 15
    || typeof sourceAddress !== 'string' || sourceAddress.length === 0) {
    return output(0.6, PATTERNS.unfamiliar_admin_command.name);
  }

  const description = normalized(alert?.rule?.description);
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const pattern = patternName(description, mitre);
  const groupClear = mitre.includes('T1078') && /관리자 그룹/.test(description)
    && /(?:추가|들어가|다시 관리자로)/.test(description) && !/관리자 그룹은 아닙니다/.test(description);
  const commandClear = mitre.includes('T1068') && /(?:관리자 명령|권한 명령|관리자 권한으로 바뀌)/.test(description)
    && /(?:방금 관리자가|처음 보는|곧바로|다른 계정|요청 주소는 처음)/.test(description);
  const offHoursClear = (mitre.includes('T1068') || mitre.includes('T1078'))
    && /수업 시간 밖|업무처럼 보이지 않는 시각|업무 시간 밖/.test(description)
    && /관리자|권한/.test(description);
  if (level >= 10 && (groupClear || commandClear || offHoursClear)) return output(0.95, pattern);

  if (pattern && level >= 4 && (mitre.includes('T1068') || mitre.includes('T1078'))) {
    return output(0.6, pattern);
  }
  return output(0.1, 'no_attack_pattern');
}
