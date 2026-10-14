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

## 10단계 저장점: 환경 변수 사본 복구와 사후 재시험

### 단일 B 메모 복구 계약

- 복구 사본은 **Git, 현재 메모 행, DB 백업 테이블에서 가져오지 않습니다.** 실행 환경이 서버 전용 변수 `RESTORE_NOTE_SNAPSHOT_BASE64`로 주입한 사본만 사용합니다. 실제 원문 SHA-256은 `RESTORE_NOTE_BACKUP_SHA256`에 별도로 고정되어야 합니다.
- 추가 환경 설정: `RESTORE_ENABLED=1`, `RESTORE_INCIDENT_AT`, `RESTORE_B_OWNER_ID`, `RESTORE_OPERATOR_USER_ID`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`. 사후 HTTP 재시험 목적지는 `RESTORE_PUBLIC_APP_URL`로 재정의할 수 있으며 기본값은 `aleph.config.json`의 공개 배포 URL입니다. 환경 값 자체는 Git·응답·감사·번들에 기록하지 않습니다.
- Vercel 운영 환경의 `RESTORE_*` 값은 비공개 민감 변수로만 보관합니다. 검증된 B 가상 메모 사본과 원문 체크섬은 저장소 파일·HTML·응답·감사 이력에 복사하지 않습니다. 복구 전후에는 환경 변수에서 사본을 다시 읽고 검증하며, 값이 없거나 달라지면 데이터 변경 전에 중단합니다.
- 사본은 `src/restore-runtime.mjs`의 `validateBNoteBackup()`가 검증하는 `stage4-b-preincident-v1` 형식이어야 합니다. 고정 B ID, 출처 커밋, 가상 메모 제목·본문, 본문 SHA-256, 매니페스트 SHA-256을 확인하고, 원문 스냅샷 SHA-256과 본문 해시는 모두 `crypto.timingSafeEqual`으로 비교합니다. `verified_at`이 `RESTORE_INCIDENT_AT`보다 늦거나 같으면 중단합니다.
- `GET /api/restore/notes/:id`는 기준 사본과 현재 한 건의 차이 필드, 버전, 해시, 계획 확인값만 반환합니다. 별칭 `GET /api/notes/restore/:id`도 동일한 핸들러로 연결됩니다.
- `POST /api/restore/notes/:id`는 요청 본문이 비어 있어야 합니다. ID·소유자·역할·제목·본문·계획 해시 등 클라이언트가 보내는 필드는 모두 HTTP 400으로 거부합니다. 실제 소유자는 검증된 Bearer 토큰과 환경의 고정 B 사용자 ID로 결정합니다. 소유자 불일치는 403, 요청 ID가 사본에 없으면 404, 환경 또는 백업 검증 재료가 없거나 검증에 실패하면 503입니다.
- POST는 미리보기에 사용한 객체를 재사용하지 않습니다. 변경 직전에 환경 변수에서 사본을 다시 읽고 전체·본문 해시를 재검증하며, 복구를 적용하는 동안 현재 메모 상태가 바뀌면 compare-and-swap으로 거부합니다. 복원 직후 DB를 다시 읽어 ID·소유자·본문 해시를 확인합니다. 응답에는 메모 본문을 넣지 않습니다.
- ALEPH 심판 서명 토큰은 검증기에서 확인한 `aleph_identity: "b"`일 때만 복구 시험 신원으로 매핑합니다. 이 예외는 `RESTORE_B_OWNER_ID`와 `RESTORE_OPERATOR_USER_ID`가 모두 고정 가상 B ID `00000000-0000-4000-8000-000000000002`와 일치할 때만 작동합니다. 심판 A나 다른 신원은 거부하며, 감사 조회도 B 본인 기록만 반환합니다. 이 예외는 시험 계정 전용이고 일반 사용자 권한을 넓히지 않습니다.

### 재시험·감사·운영 현황

- 복구 완료 직후 같은 인증 토큰으로 **실제 HTTP GET** 본인 메모 요청과 타인 메모 요청을 다시 실행합니다. 응답의 `restore.retests.normal`은 본인 메모 200 및 ID·제목·본문 일치 여부를, `restore.retests.forbidden`은 타인 메모 404 여부를 표시합니다. 수행하지 못한 시험은 `attempted: false`와 `passed: false`로 남기며 성공으로 꾸미지 않습니다.
- `GET /api/notes/audit`는 인증 사용자 본인의 감사 항목만 반환합니다. `GET /api/operations`는 확인한 항목을 `measured`, 아직 실행하지 않은 항목을 `not_run`으로 표시합니다.
- 요청·응답·감사 이력에는 메모 본문, 토큰, 비밀번호를 저장하지 않습니다. 추가 전용 감사 레코드는 서버 함수 프로세스 메모리에 남기며 복구 코드가 이를 수정·삭제하거나 DB 테이블에 감사 행을 추가하지 않습니다. **Vercel 함수의 프로세스 메모리는 영속 저장소가 아니고 인스턴스가 바뀌면 초기화될 수 있습니다.** 따라서 `process_local_append_only` 표시는 내구성 있는 중앙 감사 저장소라는 뜻이 아닙니다.
- 운영 판정기·다른 규칙·이전 감사 이력은 이 복구 경로에서 변경하지 않습니다. 본인·타인 재시험, 백업 확인, DB readback에서 실제로 확인한 결과만 측정값으로 기록합니다. 1~9단계 재시험을 실제 실행하지 않았다면 `not_run`입니다.

### 정책 사본과 검토 명령

- 검토 가능한 정책 사본은 `backups/step10/safe-policy.json`, 체크섬은 `backups/step10/safe-policy.sha256`에 커밋했습니다. 이는 메모 본문이 아닌 공개 검토용 정책 자료입니다.
- `npm run restore:plan`은 사본과 체크섬을 다시 읽고 검증해 현재 코드의 읽기 전용 정책 투영과의 변경 경로 및 확인 해시를 `artifacts/restore-plan.json`에 기록합니다.
- `npm run restore:apply -- --confirm=stage9-safe-policy-v1`는 미리보기 이후 사본 해시와 현재 정책 지문이 바뀌지 않았을 때만 실행합니다. 결과와 검증한 시험 정책은 `artifacts/`에만 출력되며, `src/decider.mjs`·운영 정책·DB·감사 이력은 쓰지 않습니다.
- `artifacts/`와 `bundle-notes.json`은 `.gitignore`에 포함합니다. `npm run bundle`은 커밋되지 않은 추적 대상 파일이 있으면 실패합니다. 번들 자체의 HTTP 점검은 GET 중심으로 유지하며 복구 POST/PUT을 보내지 않습니다.

### 복원 후 1~9단계 재시험 순서

복구 POST가 `restore.retests.passed === true`를 반환했는지 먼저 확인합니다. 그다음 아래 회귀 시험을 순서대로 실행합니다.

```sh
npm ci
npm run test:r5
npm run test:stage3
npm run test:stage4
npm run test:stage5
npm run decider:test
npm run detect:test
npm run test:stage9
npm run test:stage8
npm run test:stage10
npm run build
```

정상 결과는 A의 허용된 본인 자료 접근과 기존 기능 테스트의 통과입니다. 금지 결과는 B가 A 소유 메모를 조회·변경하지 못하고, 등록되지 않은 기기·범위 밖 자원·위험 조건이 정책에 따라 거부 또는 추가 확인을 받는 것입니다. `decider:test` 및 개별 `test:stage*`는 가상 회귀 시험이며 실제 운영 요청의 증거가 아닙니다. 실제 배포에서 확인한 본인 메모 GET과 타인 메모 GET은 복구 응답의 `restore.retests` 결과를 확인하고, 실행되지 않은 나머지 시험은 `not_run`으로 남깁니다.

`npm run bundle`은 변경 사항을 커밋한 깨끗한 작업 트리에서 마지막으로 실행합니다. 제출 묶음의 HTTP 기록에는 실제로 보낸 요청 결과만 포함하고, 인증된 복구 또는 1~9단계 실측을 실행하지 않았다면 완료로 표시하지 않습니다.

### 확인 순서

```sh
npm ci
npm run test:stage10
npm run test:stage4
npm run test:stage5
npm run test:stage8
npm run decider:test
npm run detect:test
npm run restore:plan
npm run restore:apply -- --confirm=stage9-safe-policy-v1
npm run build
npm run bundle
```

명령의 통과는 해당 로컬 테스트만 증명합니다. 실제 메모 복구 및 사후 HTTP 재시험 통과는 `POST /api/restore/notes/:id` 응답의 `restore.retests.passed === true`와 `GET /api/notes/audit`의 결과 기록으로 확인해야 합니다. 실행하지 않은 단계는 통과했다고 주장하지 않습니다.
