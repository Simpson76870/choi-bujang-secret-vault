# 9단계 탐지 연습 사건 계약

`npm run detect:test`는 `src/detect.mjs`의 공식 진입점 `detect(events)`에 가상 사건을 전달합니다. 기존의 세 필드 모양은 다음과 같습니다.

```js
{ at: '2026-10-01T00:00:00.000Z', method: 'GET', identity: { sub: 'learner_fixture' } }
```

이 레거시 모양에는 기기와 네트워크 근거가 없으므로, 조회 건수만 많아도 반드시 `{ action: 'observe' }`를 돌려줍니다. 이를 근거로 회수를 제안하지 않습니다. 회수 제안에는 아래 별도 가상 기기 계약의 복합 증거가 필요합니다.

이 파일의 사건 모양은 **로컬 연습용**입니다. 운영 반 엔진에서 검증된 사건 전달·실제 회수·경과 시간 측정은 심판/운영 엔진에서 별도로 확인해야 합니다. 로컬 테스트 통과는 실제 접속 차단이나 심판 판정이 아닙니다.

## 별도 로컬 가상 기기 사건 계약

기존 `detect(events)`의 세 항목 계약은 그대로 유지합니다. 요청에서 요구하는 기기·네트워크 조합은 운영 엔진 계약에 없는 정보이므로, 아래 필드가 모두 있는 명시적인 로컬 가상 사건을 별도 입력으로 처리합니다.

```js
{
  at: '2026-10-01T00:00:00.000Z',
  subjectId: 'learner_fixture',
  deviceId: 'aaaaaaaaaaaaaaaa',
  method: 'GET',
  decision: 'allow',
  network: 'unusual',
  source: 'local_virtual_fixture'
}
```

`readDetectionEvents(events)`는 이 필드만 읽고 동일한 필드만 가진 새 객체를 돌려줍니다. 잘못된 시각, 알 수 없는 가명/기기 형식, HTTP 메서드, 판정 또는 네트워크 값은 해당 사건을 제외합니다. 입력의 method·decision·device ID·network 신호는 확인된 엔진 이벤트에서 허용된 별칭을 정규화하며, 네트워크 신호가 없는 GET 로그와 method/decision이 없는 별도 네트워크 로그를 지원합니다. GET 로그에 기기 ID가 누락된 경우 같은 사용자와 10분 이내에 확인된 기기가 하나뿐일 때만 연결하고, 여러 기기라면 추측하지 않습니다. `body`, 토큰, 실명, 헤더 및 그 밖의 추가 속성은 결과에 복사하거나 출력하지 않습니다.

이 확장 계약은 **로컬 가상 사건용**이며, 실제 엔진이 기기나 네트워크를 제공한다는 의미는 아닙니다. 운영 입력에서는 엔진이 보증한 사건과 별도 권한이 필요합니다.

## 복합 탐지와 별도 회수 제안

`detectDeviceAnomaly(events)`는 같은 `subjectId`와 `deviceId`의 허용된 `GET`만 조회 건수로 세며, 동일한 연속 10분 창 안에 120건을 초과하고 그 창에 유효한 `network: 'unusual'` 사건이 하나 이상 있을 때에만 `{ suspicious: true, reasonCode: 'burst_read', subject, deviceId }`를 반환합니다. 비정상 네트워크 신호는 같은 주체·기기의 다른 유효 로그에 기록될 수 있으며, 로그의 `network`, `signals.network` 또는 동등한 명시적 네트워크 신호에서 읽습니다. 비정상 네트워크 로그가 조회가 아니거나 거부된 요청이어도 조회 횟수로 세지는 않지만, 복합 조건의 네트워크 근거로만 사용할 수 있습니다. 기존 사건 계약의 GET 로그에 `network`가 없을 수 있고, 별도 네트워크 텔레메트리에는 `method`와 `decision`이 없을 수 있습니다. GET 로그에서 명시적 `decision: 'deny'`/`'step_up'`은 집계하지 않으며, 별도 네트워크 로그는 절대로 읽기 횟수에 포함하지 않습니다. 지역만 다른 사건은 조건이 아닙니다. 정상 네트워크, 정확히 120건, 거부/추가 확인/쓰기 요청, 사용자 또는 기기가 서로 다른 조회, 창 밖 사건은 탐지하지 않습니다.

`detectDeviceEvents(events)`는 이 후보 결과를 별도 회수 제안으로 표현합니다:

```js
{ action: 'propose_revocation', reasonCode: 'burst_read', subject: 'learner_fixture', deviceId: 'aaaaaaaaaaaaaaaa' }
```

정상 사건은 `{ action: 'observe' }`를 반환합니다. 제안에는 검증된 가상 기기 한 개만 포함됩니다. 이 함수는 접속 판정 응답의 다섯 필드를 수정하지 않고, 어떤 API도 호출하지 않으며, 기기 등록/권한을 변경하지 않습니다. 실제 회수와 첫 의심 요청부터의 경과 시간은 제공된 심판/운영 엔진이 별도로 확인해야 하며, 로컬 테스트 통과는 그 증거가 아닙니다.
