// Standalone judge module: intentionally no imports, filesystem access, or network access.
const PATTERNS = Object.freeze({
  unsigned_new_service_persistence: Object.freeze({ evidence: 'MITRE ATT&CK T1543 covers creating or modifying system processes, including services, to establish persistence.' }),
  suspicious_scheduled_task: Object.freeze({ evidence: 'MITRE ATT&CK T1053 covers scheduled task/job execution used to maintain persistence or execute at a chosen time.' }),
  startup_folder_persistence: Object.freeze({ evidence: 'Startup-folder changes can make a program run automatically when a user signs in; this is a persistence signal, not proof by itself.' }),
  ambiguous_persistence_change: Object.freeze({ evidence: 'MITRE ATT&CK T1543 and T1053 describe service/process and scheduled-task persistence techniques; incomplete evidence warrants alerting rather than blocking.' })
});
function result(confidence, reason) {
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record', confidence, reason };
}
export function decide(alert) {
  const level = alert?.rule?.level;
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description.toLowerCase() : '';
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const path = typeof alert?.data?.path === 'string' ? alert.data.path.toLowerCase().replace(/\\/g, '/') : '';
  const temp = /\/temp\//.test(path);
  const startup = /\/startup\//.test(path) || /시작 폴더|시작 프로그램|시작 항목/.test(description);
  const service = mitre.includes('T1543') && /서비스/.test(description);
  const task = mitre.includes('T1053') && /예약 작업/.test(description);
  const unsigned = /서명 없는|서명은 확인되지 않았|서명되지|서명이 없습니다/.test(description);
  const newOrChanged = /새 서비스|새로|등록|바뀌었|변경|처음 보는|평소 목록에 없는|다시 켜도 남도록/.test(description);
  const suspiciousTask = task && temp && /처음 보는|임의 문자열|수업 시간 밖/.test(description);
  if (level >= 10 && service && (unsigned || /평소 목록에 없는|다시 켜도 남도록/.test(description)) && (temp || newOrChanged)) return result(0.96, 'unsigned_new_service_persistence');
  if (level >= 10 && suspiciousTask) return result(0.93, 'suspicious_scheduled_task');
  if (level >= 10 && startup && (temp || /평소 목록에 없는|추가/.test(description))) return result(0.9, 'startup_folder_persistence');
  if (level >= 5 && (service || task || startup)) return result(0.65, 'ambiguous_persistence_change');
  return result(0.1, 'no_persistence_pattern');
}
