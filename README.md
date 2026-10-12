# BYTE BACK 방어전 시작 틀 — 2단계 저장점

이 저장소는 2단계 자료 분리 실습용입니다. 네 건의 자료는 모두 가상 연습 데이터이며 Supabase의 `training_notes` 테이블에서 가져옵니다. 실제 학생 자료, 개인정보, 토큰 또는 비밀 키를 넣지 마세요.

## 현재 동작

- 홈페이지는 `/api/notes`를 호출해 데이터베이스에서 가상 자료를 읽습니다.
- 자료 본문은 루트나 정적 폴더의 JSON 파일로 제공하지 않습니다.
- `/api/notes`는 단계 2 연습을 위해 의도적으로 로그인 없이 호출할 수 있습니다. 지금은 고정된 가상 소유자 ID의 자료만 반환합니다. 이것은 실제 사용자 자료를 보호하는 완성된 인증 모델이 아닙니다.
- 배포 시 `/aleph.json`에 저장소·커밋·배포 주소와 단계가 생성됩니다.
- 정적 응답에는 `X-Content-Type-Options: nosniff` 등 보안 헤더를 적용합니다.

## Supabase 및 Vercel 설정

Supabase 프로젝트의 SQL Editor 또는 연결된 Supabase 관리 도구에서 `supabase/stage2-training-notes.sql`을 실행하세요. 이 SQL은 테이블과 권한만 설정합니다. 테이블은 `owner_id uuid`를 가지며 `auth.users` 외래 키를 만들지 않습니다. RLS가 켜져 있고 `anon` 및 `authenticated` 역할에는 테이블 읽기 권한을 주지 않습니다. 서버 함수는 서버 전용 키로만 조회합니다.

Vercel 프로젝트의 Settings → Environment Variables에서 다음 환경 변수를 Production 및 Preview 환경에 설정한 뒤 새 배포를 실행하세요.

- `SUPABASE_URL`: Supabase 프로젝트 API URL
- `SUPABASE_SECRET_KEY`: Supabase의 서버 전용 secret key. 브라우저용 publishable/anon key를 대신 사용하지 마세요.

키를 코드, Git, 브라우저 응답, URL 또는 로그에 넣지 마세요. 키 값을 채팅으로 보내지 않아도 됩니다. 이 저장소의 현재 Supabase 프로젝트 URL은 `https://hjuczlxovnghkljzygoz.supabase.co`입니다. Vercel 환경 설정에서 값 자체는 비밀 입력란에 직접 붙여넣으세요. 환경 변수를 추가하거나 바꾼 뒤에는 반드시 새 배포가 필요합니다.

## 확인 방법

배포 후 브라우저 개발자 도구 또는 터미널에서 확인하세요.

- `/`는 API가 정상일 때 가상 자료 네 건을 표시합니다.
- `/api/notes`는 JSON을 반환하고 `Cache-Control: no-store` 및 `X-Content-Type-Options: nosniff` 응답 헤더를 포함해야 합니다.
- `/data.json`은 HTTP 404여야 합니다.
- `/aleph.json`은 현재 단계, 실제 Git 커밋 및 Vercel 배포 정보를 포함한 JSON이어야 합니다.
- GitHub 현재 브랜치 파일과 최신 배포의 정적 산출물에서 가상 자료의 제목이나 본문에 포함된 고유 문구를 각각 검색하세요. 제목·본문 문자열을 README나 테스트 픽스처에 복사해 검색 기준 자체가 검출되는 상황을 피하고, 별도의 임시 검색어 파일을 사용하세요.
- 과거 공개 Git 커밋과 과거 Vercel 배포는 이번 변경으로 삭제되지 않습니다. 새 브랜치에서 정적 파일을 지워도 과거 커밋이나 배포 기록까지 지워졌다고 간주하면 안 됩니다.

## 빌드 및 제출 점검

로컬에서 `npm run build -- --local`을 실행하면 `public/data.json`을 다시 만들지 않고 기존 파일도 제거합니다. Vercel의 일반 배포 빌드는 `public/aleph.json`을 생성합니다. 실제 배포가 끝난 뒤 `aleph.config.json`의 `publicAppUrl`이 현재 프로덕션 주소와 일치하는지 확인하세요.

`npm run test:r5`와 `npm run test:package`는 로컬 자기 점검이며 운영 심판의 판정이 아닙니다. 제출 묶음이 필요하면 루트에 무시 대상 파일인 `bundle-notes.json`을 만들고 설명을 작성한 후 `npm run bundle`을 실행합니다. `bundle-notes.json`과 `artifacts/submission.json`은 커밋하지 마세요. 번들 점검은 배포 주소를 실제 배포로 갱신하고 API를 확인한 이후 실행해야 합니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽고 한 번에 한 제작 단위만 변경하세요. 이 단계의 비로그인 API는 의도적인 교육용 허점입니다. 다음 단계에서 인증과 접근 제어를 구현하기 전까지 실제 자료를 넣지 마세요. `src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 운영 엔진이나 심판의 판정이 아닙니다.
