// Standalone judge module: no imports, filesystem access, or network access.
const PATTERNS = Object.freeze({
 unauthorized_admin_group_addition:Object.freeze({evidence:'MITRE ATT&CK T1078 describes abuse of valid accounts; unexpected privileged-group membership is a strong account-abuse signal.'}),
 privilege_escalation_abuse:Object.freeze({evidence:'MITRE ATT&CK T1068 covers exploitation for privilege escalation; high-severity elevation paired with unfamiliar activity warrants containment.'}),
 after_hours_privileged_activity:Object.freeze({evidence:'Unexpected privileged activity outside expected hours is contextual evidence, but not proof of compromise by itself.'}),
 ambiguous_privilege_change:Object.freeze({evidence:'MITRE ATT&CK T1068 and T1078 cover privilege escalation and valid-account abuse; incomplete evidence should alert rather than automatically contain.'})
});
function result(confidence,reason){return {action:confidence>=0.85?'block':confidence>=0.5?'alert':'record',confidence,reason};}
export function decide(alert){
 const level=alert?.rule?.level, d=typeof alert?.rule?.description==='string'?alert.rule.description.toLowerCase():'', m=Array.isArray(alert?.rule?.mitre)?alert.rule.mitre:[];
 const admin=/관리자 그룹/.test(d), cmd=/관리자 명령|권한 명령|관리자 권한/.test(d), ordinary=/평범한 계정|일반 계정|방금 관리자가 된/.test(d);
 const unfamiliar=/처음 보는|다른 계정의 권한|원격 주소/.test(d), off=/수업 시간 밖|업무 시간 밖|업무처럼 보이지 않는 시각/.test(d);
 if(level>=10&&m.includes('T1078')&&admin&&(ordinary||/추가됐|추가됐습니다|들어가고/.test(d))&&(cmd||/곧바로/.test(d))) return result(0.97,'unauthorized_admin_group_addition');
 if(level>=10&&m.includes('T1078')&&admin&&/관리자 그룹에 추가/.test(d)) return result(0.90,'unauthorized_admin_group_addition');
 if(level>=10&&m.includes('T1068')&&cmd&&(unfamiliar||off||/관리자 권한으로 바뀌었/.test(d))) return result(0.92,'privilege_escalation_abuse');
 if(level>=10&&off&&(admin||cmd)) return result(0.88,'after_hours_privileged_activity');
 if(level>=5&&(m.includes('T1068')||m.includes('T1078'))&&(admin||cmd||/권한 상승|관리자 그룹|관리자 명령/.test(d))) return result(0.62,'ambiguous_privilege_change');
 return result(0.1,'no_privilege_abuse_pattern');
}
