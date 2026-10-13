# BYTE BACK 방어전 시작 틀 — 8단계 저장점

이 저장소는 자료 보호 실습용입니다. 화면과 데이터베이스에는 가상 학습 메모만 사용하세요. 실제 개인정보, 토큰, 비밀번호 또는 서버 전용 키를 코드·Git·로그·제출 묶음에 넣지 마세요.

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

- `aleph.config.json`의 `allowedRoutes`에는 위의 다섯 API 경로가 기록되어 있으며, 현재 단계는 8입니다.
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


## 8단계: 자료마다 갈 수 있는 구역을 나눕니다

- `src/decider.mjs`는 엔진이 확인한 `classId`·`projectId`·`subjectId`·`deviceId`·`service`·`method`·정확한 `path`·`route`를 대조합니다. 기본 허용 연결은 제공된 `learner_fixture` / `class_fixture` / `project_fixture` / 기기 `aaaaaaaaaaaaaaaa`의 `GET/PUT /notes/demo` 한 건뿐입니다.
- 다른 주체·반·프로젝트·기기·메모 ID, 목록, 쿼리 자원 선택, `export` 같은 추가 경로 및 등록되지 않은 공지 자원은 `deny · resource_not_allowed · resource_scope`로 거부합니다. 판정은 환경변수 매핑에 의존하지 않습니다.
- 실제 메모 API는 별도로 Supabase가 검증한 사용자 ID와 DB의 `owner_id`를 매 요청 비교합니다. 쿼리의 `id`는 자료 선택에 사용하지 않습니다.
- 공지 API는 DB의 `training_announcements.instructor_id`와 인증된 사용자를 다시 비교하고 UPDATE 조건에도 적용합니다. 판정 계약에는 강사 역할/자원 소유 등록부가 없으므로, 등록된 신뢰 자원 연결이 없는 공지 수정은 기본 거부입니다.
- `supabase/stage8-training-announcements.sql`은 별도 공지 테이블을 만들고 `anon`·`authenticated`의 직접 접근을 회수하며 서버의 `service_role` 접근만 남깁니다. 기존 메모 테이블과 내용은 변경하지 않습니다.

### 8단계 확인

```sh
npm run decider:test
npm run test:stage8
```

가상 판정에서는 정상 메모 접근이 허용되고, 일반 학생의 공지 수정 및 알 수 없는 경로는 거부되어야 합니다. API 테스트에서는 A 본인 메모는 읽고 수정할 수 있지만 B가 A의 메모를 직접 요청해도 메모가 나오지 않아야 하며, `role: "teacher"`를 위조한 일반 학생의 공지 수정도 거부되어야 합니다.

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
- `/aleph.json`이 열리고 단계가 8이며, 첫 HTML 응답에 `X-Content-Type-Options: nosniff` 또는 CSP 보안 헤더가 있습니다.
- 브라우저의 메모 CRUD 요청은 `/api/notes` 경로만 사용합니다. Auth 호출은 이번 단계에서 변경하지 않았습니다.

8단계에서 `npm run decider:test`는 제공된 본인 메모 fixture와 다른 주체·반·프로젝트·기기·자원 경로의 거부를 기본 설정 그대로 확인합니다. `npm run test:stage8`은 API가 저장된 소유자·강사 권한을 재검사하는지 확인합니다. 제출 묶음은 깨끗한 Git 작업 트리와 실제 배포 주소에 대한 HTTP 점검이 필요합니다. `bundle-notes.json`과 `artifacts/submission.json`은 Git에 커밋하지 마세요. `npm run bundle`은 GitHub Actions에서 실제 요청을 보내고 관찰한 자기 점검 결과를 제출 JSON에 기록합니다. 실행하지 않은 점검은 통과했다고 쓰지 않습니다.
