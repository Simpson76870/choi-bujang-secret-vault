# BYTE BACK 방어전 시작 틀 — 5단계 저장점

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

- `aleph.config.json`의 `step`은 5이며, `allowedRoutes`에 위의 다섯 API 경로가 기록되어 있습니다.
- `originalApiUrl`은 쿼리 문자열이 없는 원본 Data API 경로 `https://hjuczlxovnghkljzygoz.supabase.co/rest/v1/training_notes`입니다.
- `vercel.json`은 첫 HTML 응답에 `X-Content-Type-Options: nosniff`, `Content-Security-Policy` 등 보안 헤더를 설정합니다.
- `supabase/stage5-training-notes-direct-access.sql`은 학습 테이블 `public.training_notes`에 대한 `PUBLIC`, `anon`, `authenticated`의 직접 권한을 회수하는 검토용 제안입니다. **이 SQL은 저장소에 준비만 했고, Supabase DB에는 아직 실행하지 않았습니다.** 실행 전 권한 조회문을 따로 실행하고 결과를 확인한 뒤 회수문을 실행하고, 마지막 확인문으로 `anon`과 `authenticated`의 SELECT·INSERT·UPDATE·DELETE가 모두 `false`인지 확인하세요. 다른 테이블은 건드리지 않습니다.
- 4단계 RLS 소유자 정책은 방어 심층화를 위해 유지합니다. 5단계 SQL을 적용한 다음에는 4단계 권한 SQL을 다시 실행하지 마세요. 그 SQL은 `authenticated`에 CRUD를 다시 부여합니다.
- SQL을 실행하기 전까지는 4단계에서 부여된 `authenticated` 직접 권한이 DB에 남아 있을 수 있으므로, 직접 접근 차단이 운영 DB에 적용되었다고 간주하면 안 됩니다. 서버 함수의 로그인·소유자 검사는 계속 적용됩니다.

## 확인 및 제출

자동 테스트:

```sh
npm run test:r5
npm run test:stage3
npm run test:stage4
npm run test:stage5
npm run test:package
npm run build
```

배포 후 확인할 항목:

- 시크릿 창에서 로그인하지 않은 상태로 `GET /api/notes`와 `GET /api/notes/:id`를 요청하면 JSON 오류와 HTTP 401이 반환됩니다.
- A는 본인 메모를 읽고 추가·수정·삭제할 수 있고, B는 A의 메모를 읽거나 변경·삭제할 수 없어야 합니다. Stage 4/5 자동 테스트는 별도 가상 A/B ID를 사용해 소유자 검사를 검증하지만, 실제 배포의 A/B 로그인 세션 검증은 두 테스트 계정으로 별도 수행해야 합니다.
- 공개 키만으로 원본 Data API를 호출해도 데이터가 반환되지 않는지 확인합니다. `stage5-training-notes-direct-access.sql`을 DB에 적용하기 전에는 특히 `authenticated` 역할의 직접 권한 회수가 완료된 것이 아닙니다.
- `/aleph.json`이 열리고 단계가 5이며, 첫 HTML 응답에 `X-Content-Type-Options: nosniff` 또는 CSP 보안 헤더가 있습니다.
- 브라우저의 메모 CRUD 요청은 `/api/notes` 경로만 사용합니다. Auth 호출은 이번 단계에서 변경하지 않았습니다.

제출 묶음은 깨끗한 Git 작업 트리와 실제 배포 주소에 대한 HTTP 점검이 필요합니다. `bundle-notes.json`과 `artifacts/submission.json`은 Git에 커밋하지 마세요. `npm run bundle`은 GitHub Actions에서 실제 요청을 보내고 관찰한 자기 점검 결과를 제출 JSON에 기록합니다. 실행하지 않은 점검은 통과했다고 쓰지 않습니다.
