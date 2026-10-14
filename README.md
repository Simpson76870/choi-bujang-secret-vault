# BYTE BACK 방어전 시작 틀 — 10단계 저장점

이 저장소는 자료 보호 실습용입니다. 화면과 데이터베이스에는 가상 학습 메모만 사용하세요. 실제 개인정보, 토큰, 비밀번호 또는 서버 전용 키를 코드·Git·로그·제출 묶음에 넣지 마세요.

## 9단계 저장점: 도플갱어를 찾고 권한을 거둡니다

- 기존 로그인, 본인 메모 CRUD, 6·7단계 기기/추가 확인, 8단계 자원 구역 검사는 보존합니다.
- 기본 `detect(events)`는 원래 `{ at, method, identity: { sub } }` 계약을 유지합니다. 별도 `revocationProposal(events)`는 정확한 7필드 로컬 가상 사건을 처리하고, 같은 가명 사용자·기기의 허용 GET 120건 초과와 같은 창의 비정상 네트워크가 함께 있을 때만 단일 기기 제안을 냅니다. 본문·토큰·실명·헤더·임의 필드는 결과에 포함하지 않습니다.
- `detectDeviceAnomaly(events)`는 문서에 정의한 정확한 로컬 가상 사건 형식만 읽습니다. 같은 가명 주체·같은 기기의 허용 GET이 연속된 10분 창에서 120건을 초과하고 그 창 안에 `network: 'unusual'`이 하나 이상 있을 때만 의심을 표시합니다. 비정상 네트워크 사건은 조회 횟수에 포함하지 않습니다. 지역만 다른 사건, 다른 사용자·기기·창의 사건은 합산하지 않습니다.
- `revocationProposal(events)`는 기본 `detect(events)`와 분리된 결과로 복합 의심 증거가 있을 때만 `{ action: 'propose_revocation', reasonCode: 'burst_read', subject, deviceId }`를 반환합니다. 조건 미충족 또는 잘못된 입력이면 `null`을 반환하며, API를 호출하거나 `decide(request)`의 다섯 필드 응답을 변경하지 않습니다.
- 이 입력은 명시적으로 `source: 'local_virtual_fixture'`인 로컬 가상 사건입니다. 실제 엔진의 기본 세 필드 사건에는 기기·네트워크가 없으므로, 운영 사건 전달·실제 권한 회수·첫 의심 요청부터의 경과 시간은 미실행이며 심판/운영 엔진 확인 대상입니다. 회수 API 호출이나 기기 권한 변경은 구현하지 않았습니다.

재현:

```sh
npm run detect:test
npm run test:stage9
npm run decider:test
npm run test:stage4
npm run test:stage5
npm run test:stage8
npm run test:package
npm run build
npm run bundle
```

제출 묶음의 HTTP 관찰 결과는 실제 공개 배포에 전송한 요청만 기록합니다. 로컬 탐지 테스트의 성공을 운영 회수 완료나 심판 통과로 보고하지 않습니다.
## 현재 동작

- Supabase Auth 이메일·비밀번호 계정 생성, 로그인, 세션 복원, 로그아웃을 지원합니다.
- 브라우저는 메모 CRUD를 Supabase Data API에 직접 보내지 않습니다. 목록·추가·단건 조회·수정·삭제는 Vercel의 `/api/notes` 및 `/api/notes/:id` 함수만 호출합니다.
- 서버는 Supabase가 검증한 Bearer 토큰에서 사용자 ID를 얻습니다. 브라우저 본문·URL의 사용자 ID나 소유자 값은 신원으로 믿지 않습니다.
- 목록 조회는 소유자 ID로 필터링합니다. 단건 조회·수정·삭제도 매 요청마다 메모 ID와 검증된 소유자 ID를 모두 확인합니다. 다른 사용자의 메모 ID를 알더라도 404 JSON으로 거부합니다.
- 서버 전용 `SUPABASE_SECRET_KEY`는 Vercel 함수에서만 사용합니다. 브라우저에는 Auth를 위한 Supabase publishable key가 남아 있지만, 메모 자료 조회·변경에는 사용하지 않습니다.
- `public/data.json`을 만들지 않고 `/aleph.json` 및 응답 보안 헤더를 유지합니다.

## 설정

Vercel 프로젝트의 Settings → Environment Variables에서 서버 전용 변수가 다음과 같이 설정되어 있어야 합니다.

- `SUPABASE_URL`: Supabase 프로젝트 URL
- `SUPABASE_SECRET_KEY`: 서버 전용 Supabase secret key

이 값들은 API 서버에서만 사용합니다. 서버 전용 키나 access token을 HTML·응답 본문·로그에 출력하지 않습니다. `src/verify-login.mjs`는 로그인 검증 도우미이며 이 단계에서도 수정하지 않았습니다.

계정이 없으면 홈페이지의 **계정 만들기**를 이용하세요. 프로젝트에서 이메일 확인을 요구하면 받은 편지함에서 확인을 마친 뒤 홈페이지로 돌아와 로그인합니다. 확인 링크가 로컬 주소로 열리거나 리디렉션 오류가 나면 Supabase Dashboard → Authentication → URL Configuration에서 Site URL을 현재 사용 중인 Vercel 주소로, Redirect URLs에는 해당 HTTPS 주소를 등록해야 합니다. 실제 비밀번호는 채팅에 보내지 마세요.

## API 계약

| Method | Path | 동작 |
| --- | --- | --- |
| GET | `/api/notes` | 로그인 사용자 소유자의 메모 배열 `{ notes: [{ id, title, body }] }` |
| POST | `/api/notes` | `{ id?, title, body }`로 메모 생성. id가 없으면 서버에서 UUID를 만들고 `{ id, title, body }`를 반환 |
| GET | `/api/notes/:id` | 메모 한 건 `{ id, title, body }`; 없으면 404 |
| PUT | `/api/notes/:id` | `{ title, body }`로 메모 수정 |
| DELETE | `/api/notes/:id` | 삭제 결과 `{ id, deleted: true }`; 이미 없으면 404 |

로그인 토큰이 없거나 잘못되면 API는 HTML이 아닌 JSON 오류와 HTTP 401을 반환합니다. API는 서버 전용 `SUPABASE_SECRET_KEY`를 사용하므로 RLS만 믿지 않고 각 요청에서 `owner_id`를 검증합니다.

## 5단계: 자료 요청을 서버 한곳으로 모읍니다

- `aleph.config.json`의 `allowedRoutes`에는 위의 다섯 API 경로가 기록되어 있으며, 현재 단계는 10입니다.
- `originalApiUrl`은 쿼리 문자열이 없는 원본 Data API 경로 `https://hjuczlxovnghkljzygoz.supabase.co/rest/v1/training_notes`입니다.
- `vercel.json`은 첫 HTML 응답에 `X-Content-Type-Options: nosniff`, `Content-Security-Policy` 등 보안 헤더를 설정합니다.
- `supabase/stage5-training-notes-direct-access.sql`의 권한 회수문은 현재 학습용 Supabase DB에 적용했습니다. 적용 후 `anon`과 `authenticated`의 SELECT·INSERT·UPDATE·DELETE 유효 권한이 모두 `false`이고, `service_role`의 서버 권한은 유지되는 것을 직접 조회해 확인했습니다. 다른 테이블은 건드리지 않습니다.
- 4단계 RLS 소유자 정책은 방어 심층화를 위해 유지합니다. 5단계 SQL을 적용한 다음에는 4단계 권한 SQL을 다시 실행하지 마세요. 그 SQL은 `authenticated`에 CRUD를 다시 부여합니다.
- 5단계 SQL을 다시 적용할 필요는 없습니다. 4단계 권한 SQL을 다시 실행하면 `authenticated` 권한이 다시 부여될 수 있으므로 재실행하지 마세요. 메모 CRUD는 서버 함수의 로그인·소유자 검사를 계속 사용합니다.


## 6단계: 등록한 기기만 자료실에 들어옵니다

- `src/decider.mjs`는 계약에 이미 정의된 최상위 `request.deviceRegistered`만 확인합니다. 값이 정확히 `true`이면 `allow`와 `approved`를 반환하고, `false`이거나 필드가 없으면 `deny`와 `device_not_registered`를 반환합니다.
- 규칙 ID는 `device_registered`입니다. `decide(request)`의 이름·인자와 응답의 다섯 필드는 유지했습니다. 브라우저 화면, 자료실 URL, 로그인·자료 CRUD API는 변경하지 않았습니다.
- 이 규칙은 판정기용 방어 규칙입니다. 실제 기기 등록 시스템이나 브라우저 장치 증명을 새로 구현한 것은 아닙니다. 운영 엔진이 출처를 확인해 전달한 등록 상태만 사용하며 인증서·CA·서명 키·개인키를 새로 만들거나 저장하지 않습니다.

### 6단계 확인

```sh
npm run decider:test
```

가상 시험에서 등록 기기 요청은 통과하고, 미등록 요청과 등록 상태 필드가 빠진 요청은 모두 `deny · device_not_registered`로 나와야 합니다. 이 명령은 가상 요청 연습이며 운영 심판의 판정은 아닙니다. 제출 JSON을 만들 때는 커밋 후 깨끗한 작업 트리에서 `npm run bundle`을 실행합니다.


## 7단계: 평소와 다른 접속은 다시 확인합니다

- `src/decider.mjs`는 계약의 `request.signals`, `request.recentEvents`, `request.stepUp`만 읽습니다. 이 코드는 브라우저 헤더를 읽지 않으며, `source: "client_header"`처럼 출처가 불명확한 신호를 정상 접속으로 인정하지 않습니다.
- 입력 신호의 출처·지역·네트워크·시각·최근 사건이 없거나 형식이 잘못되어도 정상값을 임의로 만들어 넣지 않습니다. 명시적인 위조/불명 출처는 추가 확인을 요구하고, 계약의 `source: "none"`은 엔진이 신뢰 가능한 위치 신호를 제공하지 않는다는 뜻이므로 단독으로 모든 정상 자료 읽기를 막지는 않습니다. 최근 다량 활동 같은 위험 사건은 별도로 추가 확인을 요구합니다. `judge_fixture`는 가상 시험 데이터이며 실제 위치 증거가 아닙니다.
- 위험 조합은 **비정상 시간대(00~05시 또는 23시) + 평소와 다른 네트워크 + 최근 5분 이내 다량 활동(가상 `risk_signal` 10회 이상)** 입니다. 세 조건이 함께 나타나면 `step_up`과 `step_up_required`를 반환합니다. 지역 값만 다르다는 이유로 차단하지 않습니다.
- `docs/DECIDER_REQUEST.md`에는 `stepUp: { verified, authAgeSeconds }` 계약이 있습니다. 검증된 새 로그인 나이가 0~900초 범위일 때 가상 요청을 다시 판정하면 허용할 수 있습니다. 비밀번호나 토큰 원문은 기록하지 않습니다.
- **미실행 범위:** 현재 저장소의 `npm run decider:test`는 가상 요청 시험입니다. 제공 운영 엔진에서 실제 재로그인 시각 검증이 수행되는지와 그 전후 실제 자료 요청이 차단·재허용되는지는 이 저장소만으로 실측하지 않았습니다. 운영 엔진이 확인한 `stepUp` 값을 공급하고 자료 요청을 이 판정기에 연결해야 실제 흐름을 입증할 수 있습니다.

### 7단계 확인

```sh
npm run decider:test
```

정상 가상 요청은 `allow`, 복합 이상 접속과 출처 불명 신호는 `step_up · step_up_required`, 새 로그인 시각이 검증된 복합 사건은 재판정에서 `allow`가 나와야 합니다. 지역만 다른 정상 조합은 허용되어야 합니다. 이 시험은 운영 심판 판정이나 실제 자료 차단의 증거가 아닙니다.


## 8단계 저장점: 자료마다 갈 수 있는 구역을 나눕니다

- 판정기에서 자료별 자원 ID를 분리합니다. 본인 메모 fixture는 `notes:demo`이며 `class_fixture` / `project_fixture` / `learner_fixture` / 기기 `aaaaaaaaaaaaaaaa` 조합에 GET/PUT만 허용합니다. 계약 v1에는 강사 역할·공지 편집권한 증명이 없으므로 판정기는 공지 및 `notices` 수정 요청을 기본 거부합니다. 실제 공지 API는 검증된 서버 관리 강사 권한과 DB 소유자 일치를 별도로 확인합니다.
- 판정은 엔진이 확인한 `classId`·`projectId`·`subjectId`·`deviceId`·`service`·`method`·정확한 `path`·`route`를 대조합니다. 브라우저가 보낸 사용자 ID나 역할을 사용하지 않습니다. 다른 주체·반·프로젝트·기기·서비스·자원 ID, 쿼리 선택, `export` 같은 추가 경로는 기본 거부합니다.
- 실제 메모 API는 로그인 토큰에서 서버가 검증한 Supabase 사용자 ID를 사용합니다. 목록 조회는 `owner_id`를 필터링하고, 새 메모의 소유자는 서버에서 지정하며, 단건 GET/PUT/DELETE는 URL의 메모 ID와 검증된 소유자 ID를 함께 비교합니다. 쿼리 문자열의 `id`는 자원 선택에 사용하지 않습니다.
- 강사 공지는 `training_announcements` 테이블의 별도 UUID 자원입니다. 공개된 공지는 읽을 수 있지만, 미공개 초안은 검증된 강사 권한(`app_metadata.role === 'instructor'`)과 저장된 `instructor_id`가 모두 일치하는 경우에만 읽을 수 있습니다. 수정도 두 조건을 모두 확인하고 UPDATE 조건에서 강사 ID를 다시 비교합니다. `user_metadata.role`, 요청 본문의 `role`, `instructor_id`는 권한으로 신뢰하지 않습니다. Supabase 관리자가 해당 사용자의 `app_metadata.role`을 `instructor`로 설정하지 않은 경우 공지 수정은 기본 거부됩니다.
- `/api/announcements/:id`와 `/api/notices/:id`는 동일한 강사 권한 검사를 사용합니다. 두 경로 모두 ID는 URL 경로에서 읽으며 쿼리 파라미터로 자원을 바꿀 수 없습니다.
- `supabase/stage8-training-announcements.sql`은 기존 메모 테이블을 바꾸지 않고 별도 공지 테이블을 만듭니다. `anon`·`authenticated`의 직접 접근을 회수하며, 실제 API는 서버 측 권한 검사 후 서버 전용 키로 조회·수정합니다.

### 8단계 확인

```sh
npm run decider:test
npm run test:stage4
npm run test:stage5
npm run test:stage8
npm run build
```

가상 판정에서는 본인 메모의 GET/PUT과 등록된 강사의 공지 PUT이 허용되고, 다른 주체·반·프로젝트·기기·등록되지 않은 자원, 일반 학생의 공지 수정, `export` 같은 경로는 거부되어야 합니다. API 테스트에서는 A가 자기 메모를 읽고 수정·삭제할 수 있고, B가 A의 메모를 요청하면 404가 반환되어야 합니다. 공지 API는 저장된 강사 ID를 다시 비교해야 합니다. 이들은 로컬·모의 테스트이며 운영 심판 판정을 대신하지 않습니다.

저장소의 기존 8단계 GitHub Actions 검증은 PR에서 회귀 테스트와 로컬 빌드를 실행하고, main 배포가 해당 커밋으로 완료된 뒤 실제 HTTP 관찰 결과를 `npm run bundle`로 묶어 제출 JSON 아티팩트로 보관합니다. `bundle-notes.json`은 실행 중 생성하는 임시 파일이며 저장소에 커밋하지 않습니다.

## 확인 및 제출

자동 테스트:

```sh
npm run test:r5
npm run test:stage3
npm run test:stage4
npm run test:stage5
npm run decider:test
npm run test:package
npm run build
```

배포 후 확인할 항목:

- 시크릿 창에서 로그인하지 않은 상태로 `GET /api/notes`와 `GET /api/notes/:id`를 요청하면 JSON 오류와 HTTP 401이 반환됩니다.
- A는 본인 메모를 읽고 추가·수정·삭제할 수 있고, B는 A의 메모를 읽거나 변경·삭제할 수 없어야 합니다. Stage 4/5 자동 테스트는 별도 가상 A/B ID를 사용해 소유자 검사를 검증하지만, 실제 배포의 A/B 로그인 세션 검증은 두 테스트 계정으로 별도 수행해야 합니다.
- 공개 키만으로 원본 Data API를 호출해도 데이터가 반환되지 않는지 확인합니다. DB 권한 조회에서는 `anon`·`authenticated`의 메모 테이블 직접 CRUD가 모두 거부되는 것을 확인했습니다.
- `/aleph.json`이 열리고 단계가 10이며, 첫 HTML 응답에 `X-Content-Type-Options: nosniff` 또는 CSP 보안 헤더가 있습니다.
- 브라우저의 메모 CRUD 요청은 `/api/notes` 경로만 사용합니다. Auth 호출은 이번 단계에서 변경하지 않았습니다.

8단계에서 `npm run decider:test`는 제공된 본인 메모 fixture와 다른 주체·반·프로젝트·기기·자원 경로의 거부를 기본 설정 그대로 확인합니다. `npm run test:stage8`은 API가 저장된 소유자·강사 권한을 재검사하는지 확인합니다. 제출 묶음은 깨끗한 Git 작업 트리와 실제 배포 주소에 대한 HTTP 점검이 필요합니다. `bundle-notes.json`과 `artifacts/submission.json`은 Git에 커밋하지 마세요. `npm run bundle`은 GitHub Actions에서 실제 요청을 보내고 관찰한 자기 점검 결과를 제출 JSON에 기록합니다. 실행하지 않은 점검은 통과했다고 쓰지 않습니다.

## 10단계 저장점: 검증된 백업에서 제한적으로 복구합니다

### 안전 정책 미리보기와 시험 정책 복구

- `backups/policies/stage9-safe-policy.json`은 9단계 시작 직전 커밋 `f1dfff0d44c5c08e68fcf3e10b0075609f5e2269`의 판정기·설정 파일 blob 식별자를 근거로 삼는 기준본입니다. `src/restore-runtime.mjs`는 기준본의 원문 SHA-256과 출처를 확인합니다. 파일이 없거나 검증이 실패하면 복구를 중단합니다.
- `GET /api/restore-policy`는 유효한 심판 발급자 토큰만 허용하고, 현재 별도 시험 정책과 기준본의 변경 경로·버전·범위만 반환합니다. 실제 정책 값과 메모 본문은 미리보기에 포함하지 않습니다.
- `POST /api/restore-policy`는 미리보기에서 확인한 `backupVersion`, `confirm: true`, `expectedCurrentSha256`이 모두 정확히 일치할 때만 복구를 요청합니다. 현재 시험 정책이 중간에 바뀌면 거부합니다. 복구 범위는 `training_test_policy_state` 한 행뿐이며 운영 판정기, 다른 서비스 규칙 및 `aleph.config.json`의 운영 설정은 변경하지 않습니다. 성공한 복구는 별도 감사표에 추가 기록됩니다. POST 처리에서도 변경 직전에 백업 파일을 다시 읽어 원문 SHA-256과 출처를 재검증하고, 처음 읽은 사본과 버전·출처·정책 해시가 다르면 DB 변경 함수를 호출하지 않고 중단합니다. 백업 누락·재검증 실패·사본 변경은 각각 오류로 기록되며 `restoreExecuted: false`를 반환합니다.

### 시험 계정 B의 메모 한 건 복구

- `POST /api/restore-note`는 로그인한 계정이 소유한 것으로 확인된 한 건만 대상으로 합니다. 요청 본문은 `noteId`와 `backupVersion`뿐이며 소유자 ID는 서버가 검증한 로그인 세션에서 가져옵니다.
- 저장된 사본의 ID·소유자·버전·출처·가상 fixture 내용·내용 SHA-256·manifest SHA-256을 모두 비교합니다. 불일치 또는 사본 부재 시 복구를 중단합니다. 성공 응답은 ID·소유자·내용 해시만 반환하며 메모 본문은 감사 로그나 응답에 넣지 않습니다.
- 감사 이력은 별도 추가 전용 테이블에 남기며 복구 과정에서 삭제·수정하지 않습니다. 기존 현재 행에서 사본을 자동 생성하지 않습니다.

### 경로

| Method | Path | 목적 |
| --- | --- | --- |
| GET | `/api/restore-policy` | 안전 기준본 검증 및 변경 미리보기 |
| POST | `/api/restore-policy` | 확인된 별도 시험 정책 복구 |
| POST | `/api/restore-note` | 검증된 가상 메모 한 건 복구 |

### 10단계 확인 및 재시험 순서

```sh
npm ci
npm run test:stage10
npm run test:stage4
npm run test:stage5
npm run test:stage8
npm run decider:test
npm run detect:test
npm run test:r5
npm run test:stage3
npm run test:package
npm run build
npm run bundle
```

정상 판정은 A가 자기 메모를 읽는 요청은 계속 허용되고, B가 A의 메모를 요청하는 경우는 404로 거부되는 것입니다. 정책 복구 후 6~9단계 가상 판정 시험도 다시 실행합니다. 위 명령을 아직 실행하지 않았다면 통과로 기록하지 않습니다.

**B 메모 백업:** `training_note_backups`에는 Stage 4 가상 fixture에 정의된 기준 제목·본문과 고정 ID·소유자, 출처, 내용 SHA-256 및 manifest SHA-256을 명시적으로 저장합니다. 이 기준 사본은 현재 메모 행을 읽어 복사해 만들지 않습니다. 사본이나 해시 검증에 실패하면 복구는 계속 중단됩니다.

**복구 후 재시험:** B의 인증된 `POST /api/restore-note`가 기준 사본으로 복구에 성공하면, 서버는 전달받은 B의 Bearer 토큰을 사용해 실제 배포의 `GET /api/notes/:id`를 두 번 호출합니다. B 본인 메모는 HTTP 200과 복원된 ID·제목·본문 일치가 필요하고, 다른 소유자 메모는 HTTP 404 `NOTE_NOT_FOUND`여야 합니다. 두 HTTP 상태와 통과 여부는 `training_note_restore_retest_audit` 추가 전용 표에 기록합니다. 다른 소유자 시험 대상을 찾지 못하거나 요청이 실패하면 통과로 꾸미지 않고 미실행/실패로 남깁니다.

**정책 복구 제한:** 별도 시험 정책 상태 행이 준비되지 않은 현재 환경에서는 `/api/restore-policy`가 `TEST_POLICY_STATE_UNAVAILABLE`로 중단됩니다. 운영 판정 정책이나 다른 규칙은 변경하지 않습니다.

**CI와 실운영 검증의 구분:** GitHub Actions의 익명 HTTP 검사는 로그인 복구를 대신하지 않습니다. 복구 후 재시험은 인증된 B 복구 요청이 실제로 성공한 경우에만 실행되며, `postRestoreRetest.passed`가 `true`인 응답과 감사 기록이 있어야 통과로 간주합니다.
