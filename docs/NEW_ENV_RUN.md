# Bart 22단계 — 새 환경 재현 기록 및 릴리스 검증

> 기록일: 2026-11-05 (대한민국 표준시). 관측 로그 시각: 2026-11-05T03:45:45Z.
> 판정 상태: **검증 중 / 미완료 항목 존재 (v1.0 운영 인증 아님)**.
> 저장소: https://github.com/Simpson76870/choi-bujang-secret-vault
> 기준 브랜치: main (GitHub 저장소 설정에서 확인)
> 문서 작성 전 기준 커밋(21단계): 3dc4a9feaf000acae60a3e7143e0f23987e19b6d
> 22단계 최종 제출 커밋: **이 문서가 커밋된 뒤 생성되는 40자리 SHA**. 제출 화면의 커밋과, 새 환경에서 실행한 git rev-parse HEAD를 직접 비교할 것. 이 문서 안에 자신의 미래 커밋 SHA를 예상 기재하지 않음.
> 사용 범위: 사용자 PC에서 직접 검증한 기록이 아니라, GitHub 원문 확인·격리된 모의 DOM 점검·별도 Linux 컨테이너의 Git 복제 시도 결과를 구분해 기록.

## 1. 이전 구현과 입력·코드 경계

현재 GitHub 저장소에는 다음 항목이 존재합니다.

- package.json, package-lock.json, aleph.config.json, vercel.json, README.md
- public/index.html, api/notes.js, api/device/approval.js, api/restore-note.js
- src/notes-runtime.mjs, src/verify-login.mjs, src/decider.mjs
- student/extension.mjs, docs/STUDENT_MANUAL.md
- src/restore-runtime.mjs, src/recovery/ledger.mjs, backups/policies/stage9-safe-policy.json

학생 함수는 createStudentView의 renderIdentity, renderDecision, renderEvents, renderStatus, renderVulnerabilities, renderAiConnection, renderExplanation, renderAction입니다. 제공 화면으로부터 각각의 상태·자료를 받아 글자와 DOM으로 표현합니다. 22단계에는 새로운 렌더 함수, 요청 버튼, 인증 절차, 서버 연결 또는 판정 기준 수정이 필요하지 않습니다.

**실제 차이 및 제한**: aleph.config.json은 step 12이며 scripts/build-public.mjs도 1~12단계를 허용합니다. 현재 package.json에는 build, test:package, test:stage12 등은 있지만 check, start, demo 스크립트는 **없습니다**. 따라서 다른 학생의 22단계 해설에 나온 npm run check, npm run demo, npm start를 본 저장소에서 검증된 명령으로 쓰지 않습니다. 기존 public/index.html과 학생 13~20단계 호출의 직접 연결은 현재 저장소 원문에서 확인되지 않았습니다. ALEPH 제공 서버의 AI 게이트·SDP/XDR·OSV/원천 집행 연결은 실제 확인 전까지 **미확인(UNV)**입니다.

## 2. 새 환경 재현 계획: 원본 보존과 동일 커밋 고정

**이 절은 사용자 Windows PC에서 실행하기 위한 절차입니다. 여기 적힌 PowerShell 명령을 본인 PC에서 실제 수행했다는 뜻이 아닙니다.**

1. 기존 프로젝트 폴더를 삭제·초기화·덮어쓰기하지 않습니다. 원본 작업 트리는 별도로 보존합니다.
2. 새로운 **비어 있는 폴더**를 사용자 홈 아래 만들고 공개된 GitHub 저장소를 복제합니다. 기존 인증 파일이나 .env는 새 폴더에 복사하지 않습니다.
3. 22단계 제출 화면에 적을 **정확한 40자리 최종 커밋**을 checkout한 후 git rev-parse HEAD와 비교합니다.
4. 21단계 docs/STUDENT_MANUAL.md에 맞춰 런타임 확인 → 의존성 설치 → 로컬 정적 빌드 → 기존 테스트 → 정적 브라우저 확인 → 종료/재실행을 검증합니다.
5. 같은 커밋의 각 결과를 기록합니다. 문제 수정을 위해 새 커밋을 만들면 이전 커밋의 결과를 새 커밋 성공으로 합산하지 않고, 새로운 최종 SHA를 다시 checkout하여 검증합니다.

### 2-1. PowerShell 실행 위치와 안전한 새 폴더 명령

시작 위치는 **기존 저장소 내부가 아닌 새 PowerShell**입니다. 아래의 커밋 자리에는 이 문서를 GitHub에 커밋한 **22단계 제출용 실제 40자리 SHA**를 넣어야 합니다.

~~~powershell
node --version
npm --version
git --version

Set-Location $HOME
$reproParent = Join-Path $HOME 'Bart22-repro'
if (Test-Path $reproParent) {
    throw 'Bart22-repro 폴더가 이미 있습니다. 기존 내용을 보존하고 새 폴더 이름을 선택하세요.'
}
New-Item -ItemType Directory -Path $reproParent | Out-Null
git clone --no-checkout https://github.com/Simpson76870/choi-bujang-secret-vault (Join-Path $reproParent 'checkout')
Set-Location (Join-Path $reproParent 'checkout')

# 아래 자리를 제출 화면에 입력할 실제 22단계 40자리 SHA로 교체
$expectedCommit = '<22단계 최종 커밋 40자리>'
if ($expectedCommit -notmatch '^[0-9a-f]{40}$') {
    throw '실제 커밋 SHA를 먼저 입력하세요.'
}
git checkout --detach $expectedCommit
git rev-parse HEAD
git status --short
Test-Path .\package-lock.json
Test-Path .\student\extension.mjs
Test-Path .\docs\STUDENT_MANUAL.md
Test-Path .\docs\NEW_ENV_RUN.md
~~~

기대 결과: git rev-parse HEAD가 $expectedCommit과 정확히 같고, 네 Test-Path 결과가 True. git status --short에 예기치 않은 변경이 없어야 합니다. 실제 PC 출력은 **아직 미확인**입니다.

### 2-2. 의존성·로컬 빌드·테스트

작업 위치: 새로 복제한 **checkout 저장소 최상위**.

~~~powershell
npm ci
npm run build -- --local
npm run test:package
npm run test:stage12
git status --short
~~~

package.json의 엔진 조건은 Node.js >=22이고 package-lock.json의 lockfileVersion은 3입니다. 의존성에는 @supabase/supabase-js 2.117.2와 jose 6.2.12가 잠겨 있습니다. 현재 실행 환경에서 npm ci와 빌드, 두 테스트를 **성공적으로 실행한 기록은 없습니다**. 빌드 소스상 예상 성공 메시지는 “2단계 이후에는 public/data.json을 만들지 않습니다.”입니다. --local을 빼면 Vercel 배포 식별 환경변수 검사로 실패할 수 있습니다.

### 2-3. 로컬 브라우저·종료·재실행

선택사항: Python이 이미 설치됐다면 checkout 최상위에서 **정적 화면만** 아래 명령으로 확인합니다.

~~~powershell
python --version
python -m http.server 8000 --directory public
~~~

예상 로컬 주소: http://localhost:8000/ ; 정상 기동 시 Python이 Serving HTTP on ... port 8000을 출력합니다. 브라우저에서 public/index.html 정적 화면을 확인하고, PowerShell의 **Ctrl+C**로 종료한 뒤 **같은 명령**을 다시 실행하여 재접속합니다. 이 절차는 실제 실행 미확인입니다.

**중요:** 정적 HTTP 서버는 Vercel의 /api/... 함수, 로그인, 기기 승인, Bart 화면 데이터 전달, AI 게이트·OSV 조회·보안 조치를 제공하지 않습니다. 이를 전체 서비스 재현 성공이라고 적지 않습니다. 실제 서버리스 실행은 적법한 프로젝트 연결과 별도 Vercel CLI 및 비공개 설정이 있어야 하나, 현재 환경에서 연결·실행하지 않았습니다. 임의 권한·비밀값을 만들지 않습니다.

## 3. 새 환경 검증의 실제 관측 기록

| 확인 항목 | 환경·방법·시각 | 실제 관측 | 판정 |
| --- | --- | --- | --- |
| 원격 원문/브랜치 | 연결된 GitHub 도구, 2026-11-05 | 공개 저장소의 main 및 학생 코드/설명서/설정 원문 조회 성공 | **원문 확인** |
| Git 복제 새 폴더 | 격리 Linux 컨테이너, 2026-11-05T03:45:45Z 전후 | 별도 경로에서 git clone --no-checkout 시도. fatal: Could not resolve host: github.com, 종료 코드 128. 파일 checkout에 도달하지 못함 | **실행 실패(네트워크 DNS)** |
| Node.js | 격리 Linux 컨테이너 | v22.16.0 | **도구 버전 실측** |
| npm | 격리 Linux 컨테이너 | 10.9.2 | **도구 버전 실측** |
| Git | 격리 Linux 컨테이너 | 2.47.3 | **도구 버전 실측** |
| Python | 격리 Linux 컨테이너 | 3.13.5 | **도구 버전 실측** |
| npm ci | Git 복제가 선행되지 못함 | 설치를 실행하지 않음 | **미확인(UNV)** |
| npm run build -- --local | Git 복제가 선행되지 못함 | 실행하지 않음. 예상 메시지만 코드에서 확인 | **미확인(UNV)** |
| npm run test:package | Git 복제가 선행되지 못함 | 실행하지 않음 | **미확인(UNV)** |
| npm run test:stage12 | Git 복제가 선행되지 못함 | 실행하지 않음 | **미확인(UNV)** |
| 브라우저 로컬 접속/종료·재실행 | 정적 서버 구동 전 | 실행하지 않음 | **미확인(UNV)** |
| 13~20단계 render 함수 | GitHub 원문을 분리된 JS 가상 DOM으로 실행, 2026-11-05 | renderIdentity/renderDecision/renderEvents/renderStatus/renderAiConnection/renderExplanation/renderAction/renderVulnerabilities 8개가 표본 입력에 대해 DOM section 반환, 예외 없음 | **모의 입력 검사 8/8** |
| GitHub의 최종 22단계 커밋 새 환경 checkout | 문서 생성 전에는 SHA를 알 수 없음 | 실제 checkout은 사용자가 위 명령으로 직접 확인해야 함 | **미확인(UNV)** |
| 원본 사용자 PC 작업 폴더 보존 | 사용자 PC 파일 시스템 접근 불가 | 삭제·초기화·덮어쓰기 작업 없음. 기존 PC 폴더 상태는 조회하지 못함 | **PC 상태 미확인** |

모의 DOM 검사에는 **서버 인증, 네트워크 연결, 실제 SDP/XDR 사건, AI 모델 호출, OSV 외부 조회, 조치 요청**이 포함되지 않습니다. 한 렌더 함수가 DOM을 반환한 사실만으로 기능 전체, 통합 UI, 보안 정책, 실제 사용자가 성공했다는 뜻이 아닙니다.

## 4. 13~21단계별 누적 기능·결과·근거·미확인 이유

| 단계 | 현재 최종 원문에서 확인한 기능/파일 | 이 문서 작성 시 관측 | 실제 연결·실행 검증 |
| --- | --- | --- | --- |
| 13 | student/extension.mjs: renderIdentity; 사용자·기기·세션 상태 | 코드 확인, 모의 DOM 반환 | 실제 본인 정보 응답/새로고침 UNV |
| 14 | renderDecision; 접근 판정과 reason·checkedAt | 코드 확인, 모의 DOM 반환 | 실제 앱 접근 요청·판정 결과 UNV |
| 15 | renderEvents; XDR·접속 목록, 필터, 상세 | 코드 확인, 모의 DOM 반환 | 실제 최근 보안 기록/필터 클릭 UNV |
| 16 | renderStatus 및 renderEvents 상세; 알림·진단·미지원 조치 | 코드 확인, 모의 DOM 반환 | 실제 복사 버튼·다시 불러오기·API 상태 UNV |
| 17 | renderAiConnection, renderExplanation 기초; 연결 점검/설명 분리 | 코드 확인, 모의 DOM 반환 | 실제 AI 권한·모델 호출·시간 초과/취소 UNV |
| 18 | renderExplanation; evidenceIds/규칙/unknown/제안 미실행 | 코드 확인, 모의 DOM 반환 | 실제 AI 설명을 해당 사건에 연동한 결과 UNV |
| 19 | renderAction; prepared/executing/pending/succeeded·원천 효과 구분 | 코드 확인, 모의 DOM 반환 | 실제 원천 집행 연결 미준비, UNV |
| 20 | renderVulnerabilities; 설치 버전·OSV 결과/부분 실패 | 코드 확인, 모의 DOM 반환 | 승인된 OSV 대상·실제 외부 조회 UNV |
| 21 | docs/STUDENT_MANUAL.md; 실행 절차·Mermaid 구성도·오류 안내 | GitHub 문서 원문 확인 | 사용자 PC에서 문서 순서 실행 UNV |

기록 기준 시각: 2026-11-05. 같은 커밋의 새로운 환경 통합 결과를 실행하지 않았으므로 어느 단계도 **운영 환경에서 전체 성공했다고 기록하지 않습니다**. 이전 단계에서 수행한 모의 시험 결과를 최종 릴리스의 실제 네트워크 검증 성공으로 합산하지 않습니다.

## 5. 데이터 보존·백업·복원 계획과 제한

### 5-1. 기존에 구현된 처리와 별개의 데이터 보존

- 기존 학습용 메모 데이터는 Supabase 테이블 쪽에 있고, Git 코드의 clone/checkout만으로 데이터베이스 행이 백업되거나 복구되지 않습니다.
- Git 저장소의 backups/policies/stage9-safe-policy.json은 **정책 안전 사본**입니다. **전체 학생 메모 데이터의 백업 파일이 아닙니다.**
- src/restore-runtime.mjs는 정책 사본의 SHA-256·버전·출처를 검증합니다. api/restore-note.js는 복원 사본과 해시를 서버 **비공개 환경 변수**에서 전달받아 검증하도록 작성되어 있습니다. 사본 값·환경 변수 값을 Git/문서/채팅에 저장하지 않습니다.
- src/recovery/ledger.mjs의 감사 기록은 **프로세스 로컬 메모리 기록**입니다. 영속적 중앙 감사 저장소나 다른 서버 인스턴스 간 보존을 보장하지 않습니다.
- docs/NEW_ENV_RUN.md와 docs/STUDENT_MANUAL.md는 문서이므로 학생 데이터가 아니라 **설정·절차**의 재현 근거입니다.

### 5-2. 담당자 승인하에 검증할 보존/복구 순서(이 문서에서 실행하지 않음)

1. 데이터 소유자·담당자가 보존 대상(학습 메모, 현재 승인된 정책, 복원 대상 메모 ID)과 보존 기한·권한을 결정합니다. 전체 DB 또는 다른 사용자 데이터는 학생 권한으로 임의 복사하지 않습니다.
2. 관리 환경에서 승인된 데이터 백업 및 무결성 SHA-256을 기록하고, 애플리케이션과 별도 접근 제어된 장소에 비밀값·실제 데이터 원문을 보관합니다. 복원 자료를 공개 Git 저장소에 저장하지 않습니다.
3. 코드와 독립적으로 승인된 정책 안전 사본의 출처·버전·체크섬을 확인합니다. 사본이 없거나 무결성 불일치면 복원을 중단합니다.
4. 허가된 관리자가 기존 복원 설계와 안전 조건을 검토한 뒤 **미리보기/계획을 먼저 확인**하고, 필요한 인가·사람 확인 없이는 POST 복원을 실행하지 않습니다. npm run restore:plan은 기존 코드에 있으나 현재 새 환경에서 실행하지 않았습니다. 실제 복원은 본 단계에서 실행하지 않았습니다.
5. 승인된 복원 이후 본인 자료 재조회·타인 자료 접근 거부·데이터 체크섬·감사 자료를 실제로 재검증해야만 복원 성공으로 판정합니다. 검사하지 않은 항목은 not_run/UNV로 기록합니다.
6. 테스트/운영 계정·비밀값을 새 복제 폴더로 무단 복사하지 않습니다. 사용자가 원래 폴더의 .env 등을 새 프로젝트에 임의로 옮기지 않습니다.

**미완료:** 현재 계정의 실제 데이터 백업 파일, 전체 복원 성공, 중앙 영속 감사, 실제 기기/세션 이력 이전, 외부 AI·OSV·조치 연결은 확인되지 않았습니다. 본 문서가 이를 대신하지 않습니다.

## 6. 릴리스 식별·이동성·미해결 목록

- **릴리스 명칭:** Bart 학생 방어전 22단계 검증 중 (후보 버전, **v1.0 아님**). package.json에 release용 version 필드가 별도로 없습니다.
- **소스 출처:** GitHub main에서 고정된 최종 커밋 40자리 SHA를 사용합니다. main이라는 움직이는 이름만으로는 재현 기준이 고정되지 않습니다.
- **이동성:** package-lock.json에 의존성을 고정합니다. 기존 소스·docs·config는 Git에 보관되어야 하고, node_modules와 .env는 복제하지 않습니다.
- **환경 값:** src/notes-runtime.mjs의 서버 값은 SUPABASE_URL, SUPABASE_SECRET_KEY가 요구됩니다(이름만 기록). 로그인·기기 승인·복원·AI 권한/허용 패키지 구성은 운영 측 환경에 따릅니다. **값을 문서에 적거나 커밋하지 않습니다.**
- **원격 배포:** aleph.config.json의 publicAppUrl은 코드에 정의된 공개 주소지만, 이 재현 절차에서 실제 HTTP 200·로그인 성공을 확인하지 않았습니다.
- **미해결 1:** 새 환경의 GitHub DNS 접근 실패. 별도 폴더 checkout, npm ci, 빌드, 브라우저 시작/종료/재시작 모두 후속 실측 필요.
- **미해결 2:** 현재 저장소는 12단계 자료실 기반이며, Bart 학생 칸과 제공 서버 전체의 직접 실행 경로는 확인되지 않았습니다. 다른 학생의 npm start/demo/check 결과를 그대로 이식할 수 없습니다.
- **미해결 3:** 실제 AI 모델 호출(17단계), 원천 보안 조치 집행(19단계), 외부 OSV 조회(20단계)는 운영 연결/승인 확인 전까지 UNV.
- **미해결 4:** 보안 조치 실제 집행 연결은 아직 준비되지 않았으며, 22단계 심판의 원문 검토 통과가 이 연결 완료나 v1.0 운영 인증을 뜻하지 않습니다.

## 7. 최종 제출·원문 전달 및 재현 증빙 업데이트 규칙

1. 이 파일은 22단계용 새 학생 문서입니다. 기존 README·21단계 설명서·13~20단계 함수·제공 서버/인증/판정 코드와 Git 기록은 그대로 둡니다.
2. 22단계 과제에는 **GitHub 저장소 URL과 이 문서를 포함한 실제 최종 40자리 커밋 SHA**를 과제 화면에 직접 입력합니다. 이 문서의 21단계 기준 SHA를 22단계 SHA인 것처럼 제출하지 않습니다.
3. 비공개 저장소의 원문 묶음이 필요한 경우에만 과제 화면의 “비공개 저장소 원문 준비 방법”과 student-source-cli.mjs의 **화면에 적힌 명령**을 따릅니다. 도구·출력 경로는 사용자 PC에서 확인한 값만 사용합니다. 원문 전달과 심판 통과는 다릅니다. 현재 GitHub 저장소의 가시성은 공개로 확인됐으나, 이를 변경하지 않습니다.
4. 사용자 PC에서 실제로 복제 및 실행한 후에는 **실행 시각·해시·OS/Node/npm 버전·명령·종료 코드·브라우저 관찰·실패 이유**를 같은 커밋 기준으로 별도 검증 기록에 추가합니다. Git 문서를 수정하면 새 커밋이 발급되므로, **새로운 최종 커밋 기준으로 다시 체크아웃하고 재현**해야 합니다.
5. 기존 .env/비밀값/DB 원문/개인정보는 증빙으로 첨부하지 않습니다. 미실행은 UNV, 가상 DOM은 모의 검사, 서버 AI의 원문 검토는 코드 검토라고 명시합니다.

**결론:** 코드·문서의 존재와 8개 함수의 모의 렌더는 확인했습니다. 그러나 **동일 최종 커밋을 새 폴더에서 설치·기동한 재현은 DNS 실패로 아직 완료되지 않았습니다**. 최종 상태는 검증 중이며, 실집행·실제 연결·v1.0 운영 인증을 주장하지 않습니다.
