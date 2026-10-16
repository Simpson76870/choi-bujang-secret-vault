# 웹 주입 공격 연습

`npm run xdr:run -- web-injection`은 가상 Wazuh 경보를 독립형 decide.mjs로 판정하고 result.json을 갱신합니다.
`node xdr/web-injection/read-alerts.mjs`는 원본을 바꾸지 않고 지정된 다섯 필드만 26줄로 출력합니다.
patterns.json과 decide.mjs 상수는 MITRE ATT&CK T1190에 근거한 SQL·스크립트·상위 경로 반복 패턴입니다.

decide.mjs는 import, 파일 접근, 패키지, 환경 변수, 네트워크 호출 없이 즉시 결과만 반환합니다.
respond.mjs는 독립 판정에서도 명확한 block만 15분 거부 후보로 만들고 alert만 xdr/alerts.log에 누적합니다.
거부 규칙은 출발 주소 지문, 근거 경보 번호, 패턴, 시작·만료 시각을 포함합니다.
`createXdrDecider`는 운영 서버가 제공하는 신뢰된 subjectId→출발 주소 매핑을 사용하며 기본 판정기를 변경하지 않습니다.

검사 명령은 `node --test test/web-injection.test.mjs test/xdr-run.test.mjs`입니다.
로컬 가상 시험은 실제 운영 연결이나 심판 판정 결과를 뜻하지 않습니다.
