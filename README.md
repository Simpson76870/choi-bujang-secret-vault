# BYTE BACK 방어전 시작 틀 — 4단계 저장점

이 저장소는 자료 보호 실습용입니다. 화면과 데이터베이스에는 가상 학습 메모만 사용하세요. 실제 개인정보, 토큰, 비밀번호 또는 서버 전용 키를 코드·Git·로그·제출 묶음에 넣지 마세요.

## 현재 동작

- Supabase Auth 이메일·비밀번호 계정 생성, 로그인, 세션 복원, 로그아웃을 지원합니다.
- 서버는 Supabase가 검증한 Bearer 토큰에서 사용자 ID를 얻습니다. 브라우저 본문·URL의 사용자 ID나 소유자 값은 신원으로 믿지 않습니다.
- 메모 목록 조회와 생성은 로그인한 사용자 소유자 ID에 묶이며, 단건 조회·수정·삭제도 매 요청마다 ID와 검증된 소유자 ID를 모두 확인합니다.
- 수정은 기존 행이 본인 소유일 때만 허용하고, 새 행의 owner_id도 검증된 사용자 ID로 고정합니다. 소유자가 아닌 메모 ID는 404 JSON으로 거부합니다.
- Supabase 직접 Data API에는 authenticated 역할에 CRUD 권한과 auth.uid() 기반 RLS를 적용하며 anon에는 테이블 권한을 주지 않습니다.
- `public/data.json`을 만들지 않고 `/aleph.json` 및 보안 헤더를 유지합니다.

## 설정

Vercel 프로젝트의 Settings → Environment Variables에서 서버 전용 변수가 다음과 같이 설정되어 있어야 합니다.

- `SUPABASE_URL`: Supabase 프로젝트 URL
- `SUPABASE_SECRET_KEY`: 서버 전용 Supabase secret key

이 값들은 API 서버에서만 사용합니다. 브라우저에는 publishable key만 들어가며, 서버 전용 키나 access token을 HTML·응답 본문·로그에 출력하지 않습니다. `src/verify-login.mjs`는 단계에서 지정한 로그인 검증 도우미이며 수정하지 않습니다.

계정이 없으면 홈페이지의 **계정 만들기**를 이용하세요. 프로젝트에서 이메일 확인을 요구하면 받은 편지함에서 확인을 마친 뒤 홈페이지로 돌아와 로그인합니다. 확인 링크가 로컬 주소로 열리거나 리디렉션 오류가 나면 Supabase Dashboard → Authentication → URL Configuration에서 Site URL을 현재 사용 중인 Vercel 주소로, Redirect URLs에는 해당 HTTPS 주소를 등록해야 합니다. 실제 비밀번호는 채팅에 보내지 마세요.

## API 계약

| Method | Path | 동작 |
| --- | --- | --- |
| GET | `/api/notes` | 로그인 사용자 소유자의 메모 배열 `{ notes: [{ id, title, body }] }` |
| POST | `/api/notes` | `{ id?, title, body }`로 메모 생성. id가 없으면 서버에서 UUID를 만들고 `{ id, title, body }`를 반환 |
| GET | `/api/notes/:id` | 메모 한 건 `{ id, title, body }`; 없으면 404 |
| PUT | `/api/notes/:id` | `{ title, body }`로 메모 수정 |
| DELETE | `/api/notes/:id` | 삭제 결과 `{ id, deleted: true }`; 이미 없으면 404 |

로그인 토큰이 없거나 잘못되면 API는 HTML이 아닌 JSON 오류와 HTTP 401을 반환합니다. API는 서버 전용 `SUPABASE_SECRET_KEY`를 사용하므로 RLS에만 의존하지 않고 각 단건 요청에서도 `owner_id`를 검증합니다. 직접 Data API 접근은 `authenticated` 역할의 RLS 정책으로 별도 보호합니다.

## 4단계 소유자 검증

단건 `GET /api/notes/:id`, `PUT /api/notes/:id`, `DELETE /api/notes/:id`는 서버가 검증한 `identity.userId`와 DB의 `owner_id`를 매번 비교합니다. 다른 사용자의 메모 ID만 알아낸 요청은 404 JSON으로 거부합니다. POST는 요청 본문의 `owner_id`를 무시해 서버가 확인한 ID로 저장하고, PUT은 기존 행을 본인 소유자로 필터링하며 새 행의 `owner_id`도 인증된 ID로 고정합니다.

`supabase/stage4-training-notes-rls.sql`은 `training_notes` 테이블의 기존 권한을 회수하고 authenticated에 SELECT·INSERT·UPDATE·DELETE만 부여한 뒤, 각 작업을 `auth.uid() = owner_id` 정책으로 제한합니다. `supabase/stage4-training-notes-seed.sql`은 A/B 테스트 계정을 이메일로 찾아 가상 메모 소유자를 연결합니다. 실행 전 두 계정이 실제로 존재해야 하며, 이메일은 SQL 편집기에서만 입력하고 저장소에는 넣지 마세요.

## 확인 및 제출

배포 후 확인할 항목:

- 시크릿 창에서 로그인하지 않은 상태로 `GET /api/notes`를 열면 HTTP 401과 JSON `AUTH_REQUIRED`가 반환됩니다.
- A와 B는 각자 자기 메모만 읽고 추가·수정·삭제할 수 있어야 합니다. 삭제 뒤 해당 ID의 GET은 404를 반환합니다.
- 브라우저 코드에 서버 전용 `SUPABASE_SECRET_KEY`가 없습니다.
- `/aleph.json`이 열리고 단계가 4이며, 첫 HTML 응답에 `X-Content-Type-Options: nosniff` 또는 CSP 보안 헤더가 있습니다.
- 상대방의 메모 ID를 사용한 단건 조회·수정·삭제는 404 JSON으로 거부되어야 합니다.

Supabase DB 권한과 RLS 정책은 `supabase/stage4-training-notes-rls.sql`에 기록되어 있습니다. 데이터 시드 템플릿은 `supabase/stage4-training-notes-seed.sql`입니다.

자기 점검은 `npm run test:r5`, `npm run test:stage3`, `npm run test:stage4`, `npm run test:package`로 실행합니다. 제출 묶음은 깨끗한 Git 작업 트리와 실제 배포 주소에 대한 HTTP 점검이 필요합니다. `bundle-notes.json`과 `artifacts/submission.json`은 Git에 커밋하지 마세요. 실행하지 않은 점검은 통과했다고 쓰지 않습니다.
