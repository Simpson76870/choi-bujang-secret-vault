# BYTE BACK 방어전 시작 틀 — 2단계 저장점

이 저장소는 2단계 자료 분리 실습용입니다. 화면에 표시되는 메모는 모두 가상 데이터입니다. 실제 학생 자료, 개인정보, 토큰 또는 서버 전용 키를 코드·Git·제출 묶음에 넣지 마세요.

## 현재 동작

- 홈페이지는 `/api/notes`를 호출해 Supabase의 `public.training_notes`에서 가상 자료 네 건을 가져옵니다.
- 루트의 `data.json`과 정적 폴더의 `public/data.json`은 저장소의 최신 파일에서 제거했습니다.
- 테이블에는 독립된 `owner_id uuid`가 있고 `auth.users` 외래키는 없습니다. RLS가 켜져 있으며 `anon`·`authenticated`에는 읽기 권한이 없습니다.
- `api/notes.js`는 서버 측 `SUPABASE_URL`과 `SUPABASE_SECRET_KEY` 환경변수만 사용합니다. 키를 브라우저 파일, 응답 본문 또는 로그에 넣지 않습니다.
- Vercel 빌드는 `public/data.json`을 재생성하지 않고 배포용 `public/aleph.json`은 계속 만듭니다. 응답에는 `X-Content-Type-Options: nosniff` 등 보안 헤더가 설정됩니다.

## Supabase 및 Vercel 설정

Supabase SQL Editor에서 `supabase/stage2-training-notes.sql`을 실행합니다. 이 스크립트는 `public.training_notes`를 준비하고 고정된 가상 소유자 ID에 교육용 자료 네 건을 넣습니다. 본문은 SQL 소스에서 Base64로 표현하지만, Base64는 암호화가 아닙니다. 가상 데이터만 사용하고 실제 정보는 절대 넣지 마세요. 다시 실행해도 같은 소유자·제목의 행이 중복 생성되지 않습니다.

Vercel 프로젝트의 **Settings → Environment Variables**에서 Production 및 Preview에 다음 값을 설정한 뒤 새 배포를 실행합니다.

- `SUPABASE_URL`: Supabase 프로젝트 API URL
- `SUPABASE_SECRET_KEY`: 서버 전용 Supabase secret key. 브라우저용 publishable/anon 키로 대체하지 마세요.

키를 코드, Git, 브라우저 응답, URL 또는 로그에 넣지 마세요. 키 값을 채팅으로 보내지 않아도 됩니다. Supabase 프로젝트 URL은 `https://hjuczlxovnghkljzygoz.supabase.co`입니다. 환경 변수를 추가하거나 변경한 뒤에는 새 배포가 필요합니다.

## 확인 절차

배포 후에는 직접 실행한 결과만 기록하고, 아직 실행하지 않은 검사는 통과했다고 쓰지 않습니다.

- `/`에서 카드 네 건이 표시되는지 확인합니다.
- `/data.json`은 HTTP 404여야 합니다. `/aleph.json`은 현재 단계·커밋·배포 주소를 담은 JSON이어야 합니다.
- 비로그인 브라우저에서 `/api/notes`를 열어 응답에 가상 자료 네 건이 나오는지 확인합니다. 이건 의도적으로 남겨 둔 다음 단계의 약점입니다.
- 개발자 도구의 Network 탭에서 첫 화면 응답에 `X-Content-Type-Options: nosniff`가 포함되는지 확인합니다.

### 최신 Git 파일에서 가상 메모 본문 검색

Windows PowerShell에서 아래 절차를 실행하세요. 검색 기준은 기존 1단계 커밋에서 읽어 오므로 본문 문장을 README나 코드에 복사할 필요가 없습니다.

```powershell
$ref = 'b0df74156aa93df21c7bc7a06d602de48575c1a0'
$oldJson = (git show "${ref}:data.json" | Out-String) | ConvertFrom-Json
$phrases = @($oldJson.notes | ForEach-Object { $_.content })
$tracked = @(git ls-files | Where-Object { Test-Path $_ })
$hits = @(Select-String -Path $tracked -SimpleMatch -Pattern $phrases -ErrorAction SilentlyContinue)
if ($hits.Count -gt 0) { $hits; throw "현재 추적 파일에 가상 메모 본문이 남아 있습니다." }
"현재 추적 파일에서 가상 메모 본문 일치 항목 없음"
```

기본 브랜치가 최신 변경을 반영한 상태인지 먼저 확인한 뒤 실행합니다. 배포 직전의 정적 산출물도 `Get-ChildItem .\public -Recurse -File | Select-String -SimpleMatch -Pattern $phrases`로 검색합니다. 예상 결과는 일치 항목 없음입니다. GitHub 웹 화면에서도 저장소의 최신 기본 브랜치 파일을 기준으로 같은 네 문장을 검색할 수 있습니다. 검색어 자체를 최신 소스에 복사하지 마세요.

API는 런타임에 DB의 본문을 반환하기 때문에 `/api/notes`의 응답에는 문장이 나타나는 것이 정상입니다. 이것은 정적 파일이나 저장소 소스에 남아 있는 것과는 구분해 기록하세요.

## 남은 약점 및 과거 노출의 한계

`GET /api/notes`에는 인증·인가가 없습니다. 누구나 주소를 직접 호출해 가상 자료를 읽을 수 있습니다. 이번 단계는 서버 전용 키를 소스와 브라우저에서 분리하는 작업이며, 자료별 접근 제어를 완성한 것은 아닙니다. 3단계에서 인증·인가를 만들기 전까지 실제 자료를 넣지 마세요.

이 변경은 과거 공개 Git 커밋이나 이미 생성된 Vercel 배포를 지우지 않습니다. 오래된 커밋이나 배포 URL에는 예전 정적 데이터가 남아 있을 수 있으므로 과거 노출이 해소됐다고 쓰지 마세요.

## 빌드 및 제출 점검

로컬에서 `npm run build -- --local`을 실행하면 `public/data.json`을 제거하고 다시 만들지 않습니다. Vercel의 일반 배포 빌드는 `public/aleph.json`을 생성합니다.

`npm run test:r5`와 `npm run test:package`는 로컬 자기 점검이며 운영 심판의 판정이 아닙니다. 제출 묶음이 필요하면 루트에 Git 무시 대상 파일인 `bundle-notes.json`을 만들고 이번 단계 설명을 작성한 뒤 `npm run bundle`을 실행합니다. 이 점검은 깨끗한 작업 트리, 올바른 HTTPS `origin`, 실제 배포 주소와 HTTP 결과를 요구합니다. `bundle-notes.json`과 `artifacts/submission.json`은 커밋하지 마세요.

[AGENTS.md](AGENTS.md)를 먼저 읽고 한 번에 한 제작 단위만 변경하세요. `src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 운영 엔진이나 심판의 판정이 아닙니다.
