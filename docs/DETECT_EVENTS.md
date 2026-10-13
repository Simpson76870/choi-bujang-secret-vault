# 9단계 탐지 연습 사건 계약

`npm run detect:test`는 `src/detect.mjs`의 공식 진입점 `detect(events)`에 가상 사건을 전달합니다. 기존의 세 필드 모양은 다음과 같습니다.

```js
{ at: '2026-10-01T00:00:00.000Z', method: 'GET', identity: { sub: 'learner_fixture' } }
```

같은 `identity.sub`의 GET이 이동하는 10분 창에서 120건을 초과하면 `detect(events)`는 `{ action: 'propose_revocation', reasonCode: 'burst_read', subject }`를 반환합니다. 정확히 120건, 다른 사용자의 합산, 10분 창 밖의 조회는 제안하지 않습니다. 이 기본 결과는 아래의 가상 기기 대상 복합 제안과는 별개입니다.

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

`readDetectionEvents(events)`는 정확히 이 일곱 필드만 읽고 새 객체를 돌려줍니다. `source`는 `local_virtual_fixture`, 시각은 정규 UTC ISO 문자열, 기기 ID는 16자리 소문자 16진수, `method`·`decision`·`network`는 위 계약의 허용값이어야 합니다. 누락·별칭·다른 형식은 추측하거나 보정하지 않고 제외합니다. `body`, 토큰, 실명, 헤더 및 그 밖의 추가 속성은 결과에 복사하거나 출력하지 않습니다.

이 확장 계약은 **로컬 가상 사건용**이며, 실제 엔진이 기기나 네트워크를 제공한다는 의미는 아닙니다. 운영 입력에서는 엔진이 보증한 사건과 별도 권한이 필요합니다.

## 복합 탐지와 별도 회수 제안

`detectDeviceAnomaly(events)`는 같은 `subjectId`와 `deviceId`의 허용된 `GET`만 조회 건수로 세며, 동일한 연속 10분 창 안에 120건을 초과하고 그 창에 유효한 `network: 'unusual'` 사건이 하나 이상 있을 때에만 `{ suspicious: true, reasonCode: 'burst_read', subject, deviceId }`를 반환합니다. 비정상 네트워크 신호는 같은 주체·기기의 별도 유효 로컬 가상 사건에 기록될 수 있습니다. 모든 복합 사건은 위의 일곱 필드 계약을 만족해야 합니다. 비정상 네트워크 사건이 GET이 아니거나 거부된 요청이어도 조회 횟수로 세지 않으며, 네트워크 근거로만 사용합니다. 지역만 다른 사건은 조건이 아닙니다. 정상 네트워크, 정확히 120건, 거부/추가 확인/쓰기 요청, 사용자 또는 기기가 서로 다른 조회, 창 밖 사건은 탐지하지 않습니다.

`revocationProposal(events)`는 이 후보 결과를 탐지/접속 판정과 분리된 회수 제안으로 표현합니다. 복합 조건이 충족되지 않으면 `null`을 반환합니다:



```js
{ action: 'propose_revocation', reasonCode: 'burst_read', subject: 'learner_fixture', deviceId: 'aaaaaaaaaaaaaaaa' }
```

`detectDeviceEvents(events)`는 `revocationProposal(events)` 결과가 없을 때 `{ action: 'observe' }`를 반환합니다. 제안에는 검증된 가상 기기 한 개만 포함됩니다. 이 함수는 접속 판정 응답의 다섯 필드를 수정하지 않고, 어떤 API도 호출하지 않으며, 기기 등록/권한을 변경하지 않습니다. 실제 회수와 첫 의심 요청부터의 경과 시간은 제공된 심판/운영 엔진이 별도로 확인해야 하며, 로컬 테스트 통과는 그 증거가 아닙니다.
