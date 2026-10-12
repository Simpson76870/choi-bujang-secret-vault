# BYTE BACK 방어전 시작 틀 — 3단계 저장점

이 저장소는 자료 보호 실습용입니다. 화면과 데이터베이스에는 가상 학습 메모만 사용하세요. 실제 개인정보, 토큰, 비밀번호 또는 서버 전용 키를 코드·Git·로그·제출 묶음에 넣지 마세요.

## 현재 동작

- Supabase Auth의 이메일·비밀번호 계정 생성, 로그인, 로그인 상태 복원, 로그아웃 화면이 있습니다.
- 브라우저는 공개 가능한 Supabase Project URL과 publishable key만 사용합니다. 공식 `@supabase/supabase-js` SDK를 불러와 인증 흐름을 처리합니다.
- `GET /api/notes`는 서버가 `src/verify-login.mjs`로 Bearer access token을 검증한 뒤 로그인 사용자의 `owner_id` 메모 목록만 반환합니다.
- `POST /api/notes`는 서버가 확인한 사용자 ID를 `owner_id`로 저장합니다. `GET|PUT|DELETE /api/notes/:id`는 메모 단건 조회·수정·삭제를 제공합니다.
- `public/data.json`을 다시 만들지 않으며 `/aleph.json` 생성과 `X-Content-Type-Options: nosniff` 등의 보안 헤더를 유지합니다.

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
| POST | `/api/notes` | `{ id?, title, body }`로 메모 생성. id가 없으면 서버에서 UUID를 만들고 `{ id }`를 반환 |
| GET | `/api/notes/:id` | 메모 한 건 `{ id, title, body }`; 없으면 404 |
| PUT | `/api/notes/:id` | `{ title, body }`로 메모 수정 |
| DELETE | `/api/notes/:id` | 삭제 결과 `{ id, deleted: true }`; 이미 없으면 404 |

로그인 토큰이 없거나 잘못되면 API는 HTML이 아닌 JSON 오류와 HTTP 401을 반환합니다. 메모 테이블의 RLS는 켜져 있고 직접 `anon`/ `authenticated` 권한을 주지 않습니다. 서버만 `SUPABASE_SECRET_KEY`로 데이터베이스를 읽고 변경합니다.

## 남아 있는 의도적 약점

3단계는 로그인한 신원인지 확인하지만, 단건 `GET /api/notes/:id`, `PUT /api/notes/:id`, `DELETE /api/notes/:id`에서 요청 사용자가 그 메모의 소유자인지는 아직 검사하지 않습니다. 따라서 로그인한 B가 A의 메모 ID를 알고 있다면 단건 조회·수정·삭제를 시도할 수 있습니다. 이 소유자 검사는 4단계에서 추가해야 합니다. 이 단계에서도 실제 자료를 넣지 마세요.

2단계 이전의 공개 Git 커밋과 과거 Vercel 배포 기록은 자동으로 지워지지 않습니다. 과거 정적 자료가 완전히 소거됐다고 주장하지 마세요.

## 확인 및 제출

배포 후 확인할 항목:

- 시크릿 창에서 로그인하지 않은 상태로 `GET /api/notes`를 열면 HTTP 401과 JSON `AUTH_REQUIRED`가 반환됩니다.
- 정상 계정 로그인 후 메모 추가·수정·삭제가 됩니다. 삭제 뒤 해당 ID의 GET은 404를 반환합니다.
- 브라우저 코드에 서버 전용 `SUPABASE_SECRET_KEY`가 없습니다.
- `/aleph.json`이 열리고 단계가 3이며, 첫 HTML 응답에 `X-Content-Type-Options: nosniff` 또는 CSP 보안 헤더가 있습니다.
- 소유자 검사는 일부러 다음 단계까지 남겨 두었습니다.

Supabase DB 권한 변경은 `supabase/stage3-training-notes-crud.sql`에 기록되어 있습니다. 다시 실행해도 동일한 권한만 부여합니다.

자기 점검은 `npm run test:r5`, `npm run test:stage3`, `npm run test:package`로 실행합니다. 제출 묶음은 깨끗한 Git 작업 트리와 실제 배포 주소에 대한 HTTP 점검이 필요합니다. `bundle-notes.json`과 `artifacts/submission.json`은 Git에 커밋하지 마세요. 실행하지 않은 점검은 통과했다고 쓰지 않습니다.
