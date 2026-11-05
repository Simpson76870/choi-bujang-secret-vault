# Bart 보안 Agent — 학생 실행 설명서와 시스템 구성도 (21단계)

> 기준: 2026-11-05 GitHub 저장소의 실제 코드와 설정을 읽어 정리했습니다.
> 저장소: https://github.com/Simpson76870/choi-bujang-secret-vault
> 확인 상태: 코드·설정은 확인했습니다. 사용자 PC 설치, 로컬 서버 구동, 브라우저 접속, 실제 AI 호출·OSV 조회·보안 조치 및 ALEPH 판정은 미확인입니다.

## 1. 목적·기능·현재 지원 범위

이 프로젝트는 BYTE BACK 방어전의 로그인 자료실·기기 승인·본인 자료 접근·정책·복원 실습을 보존하면서, student/extension.mjs에 Bart 보안 Agent의 13~20단계 학생용 상태 표시 함수를 작성한 저장소입니다. 학생 함수는 제공 화면이 전달하는 입력을 DOM에 표시하는 역할이며, 임의의 서버 요청이나 조치 집행을 하지 않습니다.

**중요한 실행 환경 차이**

- 현재 aleph.config.json의 step은 12입니다. scripts/build-public.mjs 또한 설정 step이 1~12인지 검사합니다. 21단계라며 설정값을 임의 변경하지 않습니다.
- 현재 저장소에는 public/index.html, api/notes.js, api/device/approval.js, api/restore-note.js, src/notes-runtime.mjs, src/verify-login.mjs, src/decider.mjs, student/extension.mjs가 실제로 있습니다.
- 이 저장소에서 public/app.js, src/server.mjs, vendor/clco-http.mjs는 찾지 못했습니다. 기존 public/index.html에서 student/extension.mjs를 직접 불러오는 코드도 확인되지 않았습니다. 로컬 자료실 실행만으로 Bart 학생 칸이 표시된다고 주장할 수 없습니다.
- 13~20단계 입력값의 제공·SDP/XDR·수업용 AI 게이트·OSV 연결은 ALEPH 제공 실행 환경의 계약입니다. 실제 서버 연결 및 성공은 저장소 코드만으로 확인하지 못했습니다.
- 공식 과제에 따른 관측 범위: 본인 최근 보안 기록 최대 40건, 등록 기기 최대 100개, 현재 검증된 세션 1개. 전체 직원 기록·과거 세션 전체·실시간 전체 탐지가 아닙니다.

## 2. 준비 프로그램과 실제 버전 확인

| 항목 | 저장소에서 확인한 내용 | 사용자 PC 실측 |
| --- | --- | --- |
| Node.js | package.json의 engines.node: 22 이상 | 미확인 |
| npm | package.json에 scripts 정의 | 설치 버전 미확인 |
| Git | 커밋·저장소 확인에 사용 | 설치 버전 미확인 |
| 라이브러리 | @supabase/supabase-js 2.117.2, jose 6.2.12 (package.json) | npm ci 결과 미확인 |
| 잠금 파일 | package-lock.json 존재, lockfileVersion 3 | 현재 설치 일치 여부 미확인 |
| PowerShell | Windows 기준 명령 예시 | 실제 Windows·PowerShell 버전 미확인 |
| Vercel CLI | package.json의 설치 의존성이 아님 | 설치 및 프로젝트 연결 미확인 |
| Python | 정적 화면만 확인할 때 사용 가능한 선택 도구 | 설치 미확인 |

새 PowerShell에서 다음을 실행해 **사용자 PC의 실제 버전**을 확인합니다.

~~~powershell
node --version
npm --version
git --version
~~~

작업 폴더는 package.json, package-lock.json, aleph.config.json이 있는 **Git 저장소 최상위 폴더**입니다. 실제 Windows 절대경로는 저장소에 없으므로 개인 PC에서 확인합니다. 기존 폴더를 삭제하거나 덮어쓰지 않습니다.

~~~powershell
# 기존 저장소 최상위 폴더에서 실행
git rev-parse --show-toplevel
git status --short
Get-Location
Test-Path .\package.json
Test-Path .\student\extension.mjs
~~~

정상적인 폴더라면 두 Test-Path 결과가 True입니다. git status --short에 변경 내역이 있으면 무엇인지 확인하고 작업을 보존합니다.

코드에서 실제 확인한 주요 경로:

~~~text
<Git 저장소 최상위 폴더>/
├─ package.json                  npm 스크립트, Node 22 이상
├─ package-lock.json             의존성 버전 잠금(lockfileVersion 3)
├─ aleph.config.json             기존 step 12 설정
├─ vercel.json                   배포 빌드·URL 재작성·보안 헤더
├─ README.md                     기존 BYTE BACK 프로젝트 설명
├─ public/index.html             기존 로그인 자료실의 브라우저 화면
├─ api/notes.js                  서버리스 메모 API
├─ api/device/approval.js        등록 기기 승인 확인 API
├─ api/restore-note.js           복원·감사·운영 기능
├─ src/notes-runtime.mjs         인증과 메모 데이터 접근 공통 코드
├─ src/verify-login.mjs          로그인 검증
├─ src/decider.mjs               정책 판정 코드
├─ scripts/build-public.mjs      정적 파일 빌드
├─ scripts/deployment-identity.mjs 배포 식별정보 검사
├─ student/extension.mjs         Bart 학생 화면(13~20단계)
└─ docs/STUDENT_MANUAL.md        21단계 학생 작성 문서
~~~

## 3. 설치·빌드·실행·종료·재실행

### 3-1. 기존 저장소 루트에서 의존성 준비

~~~powershell
git rev-parse --show-toplevel
git status --short
npm ci
~~~

npm ci는 package-lock.json을 기준으로 설치하며 기존 node_modules를 재구성할 수 있습니다. 실행 전에 기존 작업과 로컬 환경을 확인합니다. 이 문서 작성 중 실제 사용자 PC에서 실행한 명령은 아닙니다.

### 3-2. 코드에 정의된 로컬 빌드

~~~powershell
npm run build -- --local
~~~

- package.json의 build 명령은 node scripts/build-public.mjs입니다.
- scripts/build-public.mjs에서 --local 플래그는 Vercel 배포 식별용 public/aleph.json 생성과 Vercel 시스템 환경값 검사를 건너뛰도록 구현되어 있습니다.
- 코드상 예상 성공 출력: “2단계 이후에는 public/data.json을 만들지 않습니다.” 실제 출력은 아직 확인하지 않았습니다.
- --local 없이 npm run build만 실행하면 Vercel 배포 메타데이터가 없는 로컬 환경에서 “배포 식별 정보를 확인할 수 없습니다” 오류가 발생할 수 있습니다.
- build는 정적 파일 준비이지 로그인·API·Bart 제공 화면 통합 구동을 뜻하지 않습니다.

현재 package.json에 실제 정의된 회귀 테스트 예시(실행 결과 미확인):

~~~powershell
npm run test:package
npm run test:stage12
~~~

**현재 저장소에는 npm start와 npm run demo가 정의되어 있지 않습니다.** 첨부된 다른 학생의 해설에 있는 명령을 그대로 복사해 이 프로젝트의 실행 명령이라고 쓰지 않습니다. npm run bundle은 별도의 기존 1~12단계 제출 묶음 도구이므로 21단계 제출 도구로 사용하지 않습니다.

### 3-3. 로컬 브라우저 열기와 종료

기존 설정에 기록된 공개 주소(설정값 확인, 실제 HTTP 접속은 미확인):

https://choi-bujang-secret-vault-git-main-simpson76870.vercel.app

정적 HTML만 확인하려는 경우 **Python이 이미 설치돼 있다면** 프로젝트 최상위 폴더에서:

~~~powershell
python --version
python -m http.server 8000 --directory public
~~~

서버가 실제로 시작됐다면 주소는 http://localhost:8000/ 입니다. 정상 시작 신호는 Python 콘솔의 “Serving HTTP on ... port 8000” 문구입니다. 종료는 실행 중인 PowerShell에서 Ctrl+C, 재시작은 같은 명령을 다시 실행합니다.

**이 방식은 정적 파일 확인에 한정됩니다.** Python HTTP 서버는 Vercel 서버리스 API를 제공하지 않으며 로그인 자료 요청·기기 승인·복원·Bart 학생 렌더 연결을 검증하지 못합니다.

전체 서버리스 API의 로컬 실행에는 별도 Vercel CLI와 프로젝트 연결·비공개 환경 설정이 필요합니다. vercel dev는 Vercel CLI의 명령이지만 **이 저장소에서 실행한 사실이 없고 package.json에도 CLI가 없습니다.** 이미 설치·연결된 환경에서만 프로젝트 루트에서 사용하고 실제 CLI가 표시하는 localhost 주소를 확인합니다. 포트와 정상 구동을 미리 단정하지 않습니다.

### 3-4. 서버 설정·비밀값

- src/notes-runtime.mjs에서 서버 전용 SUPABASE_URL 및 SUPABASE_SECRET_KEY 존재 여부를 검증합니다. 미설정이면 NOTES_SERVICE_NOT_CONFIGURED와 HTTP 503 오류가 반환될 수 있습니다.
- api/device/approval.js는 본인 계정의 서버 측 승인 여부에 따라 승인 대기 또는 접근 제한을 반환할 수 있습니다.
- .gitignore에서 .env, .env.*, node_modules/, artifacts/, public/aleph.json 및 bundle-notes.json이 제외되는 것을 확인했습니다.
- 비밀번호·토큰·API 키 값은 문서·커밋·콘솔 공유·화면에 적지 않습니다. 서버용 비공개 환경에만 보관하고 설정 변경은 담당자 권한으로만 처리합니다.

## 4. 시스템 구성도(글로 된 Mermaid)와 실제 연결 경계

### 4-1. 현재 저장소에서 코드로 확인한 기존 자료실 흐름

~~~mermaid
flowchart LR
  B["브라우저 public/index.html"]
  Auth["Supabase Auth SDK"]
  API["Vercel API: api/notes.js 및 api/device/approval.js"]
  Runtime["src/notes-runtime.mjs + src/verify-login.mjs"]
  DB["Supabase"]
  B -->|"로그인"| Auth
  B -->|"요청 /api/..."| API
  API --> Runtime
  Runtime --> DB
  API -->|"기기 등록 확인"| Auth
~~~

public/index.html의 브라우저 스크립트는 Supabase Auth SDK를 사용하고 /api/notes, /api/notes/:id, /api/device/approval에 요청합니다. vercel.json은 npm run build를 빌드 명령으로, public을 출력 폴더로 설정합니다. 서버 함수는 src/notes-runtime.mjs 및 인증 검증 코드를 이용합니다. 여기까지가 현재 저장소에서 확인한 실제 파일 관계입니다.

### 4-2. 13~20단계의 제공 실행 환경과 Bart 표시 함수

~~~mermaid
flowchart LR
  B["브라우저 / ALEPH 제공 화면"]
  L["로컬 앱 서버·제공 서버 계층<br/>(현 저장소에서 경로·실행 미확인)"]
  SDP["접근제어/SDP 감사·XDR<br/>(연결 미확인)"]
  AIG["수업용 AI 게이트웨이<br/>(실제 호출 미확인)"]
  OSV["OSV 알려진 취약점 데이터<br/>(실제 조회 미확인)"]
  S["student/extension.mjs<br/>입력 렌더링만 담당"]
  B -. "접근 요청·기록/결과 조회: 제공 코드" .-> L
  L -. "접근 판정·XDR" .-> SDP
  L -. "AI 연결 및 설명" .-> AIG
  L -. "승인된 패키지 버전 조회" .-> OSV
  B -->|"status / mode / data / error 등 입력"| S
~~~

**점선은 공식 과제에서 설명하는 데이터 흐름이며 현재 저장소에서 구동·연동됐다는 증거가 아닙니다.** student/extension.mjs는 제공 화면의 입력을 createElement/textContent로 표시합니다. 요청 버튼, 인증, AI 모델 실제 호출, OSV 네트워크 요청, 조치 POST는 학생 렌더 함수의 책임이 아닙니다.

## 5. 제공 코드와 학생 구현의 경계 및 함수 목록

| 기능 | 실제 코드/호출 자리 | 코드 확인 및 책임 |
| --- | --- | --- |
| 기존 로그인·가상 메모 자료실 | public/index.html | 실제 파일 확인. Bart 학생 화면을 직접 import하는 코드는 미확인 |
| 메모 API·등록 기기 확인 | api/notes.js, api/device/approval.js, src/notes-runtime.mjs | 제공·기존 단계 서버 기능. 21단계에서 수정하지 않음 |
| 접근 규칙·복원 관련 코드 | src/decider.mjs, api/restore-note.js | 제공·기존 코드 유지 |
| 13단계: 본인 계정·기기·세션 | student/extension.mjs의 renderIdentity | me/devices/sessions별 loading/ok/error 및 상태 표시 |
| 14단계: 업무 앱 접근 판정 | renderDecision | allow/deny/challenge/unknown·이유·확인 시각 구분 |
| 15~16단계: 접속/XDR 기록·상세 | renderEvents | 최신순 기록, 필터, 근거·규칙·상태, 미지원 조치 안내 |
| 16단계: 기기·세션·알림·진단 | renderStatus | 빈 목록/오류 구분, 도움정보 복사 |
| 17단계: AI 연결 점검 | renderAiConnection | 전송 점검/권한/모델 수와 사건 설명 미실행 구분 |
| 18단계: 근거 기반 사건 설명 | renderExplanation | 설명 근거 ID·규칙·unknown·제안 미실행 검증 |
| 19단계: 조치 수명주기 | renderAction | 준비, 전달, ACK, 효과 관측 구분; 실제 조치 요청 없음 |
| 20단계: 설치 버전·OSV 표시 | renderVulnerabilities | 잠금 파일·정확 버전·출처·취약점·미조회/부분 실패 구분 |
| 제공 화면의 버튼/요청 | ALEPH 제공 환경(이 저장소에 원문 연결 미확인) | 다시 불러오기·연결 점검·결과 재조회 등. 학생 코드가 임의 추가하지 않음 |

함수가 파일에 구현되어 있다는 **코드 확인**과, 제공 앱이 이를 호출해서 실제 데이터를 표시하는 **화면/연동 실측**을 구별합니다.

## 6. 오류별 확인·복구 방법

| 증상 또는 코드 | 의미 | 확인 및 조치 |
| --- | --- | --- |
| node/npm 없음 또는 Node 22 미만 | 런타임 준비 미완료 | node --version 확인, 지원 버전 준비 후 새 PowerShell에서 재확인 |
| npm ci 실패 | 설치·잠금 파일·네트워크 등 원인 가능 | 콘솔 오류 확인, 기존 package-lock.json을 임의 수정하지 않음 |
| 로컬 build의 배포 식별 오류 | Vercel 시스템 메타데이터 없는 상황 | 로컬에서는 npm run build -- --local. 실제 배포 성공과 구분 |
| 정적 로컬 화면에서 /api 404 | 정적 서버가 Vercel API를 제공하지 않음 | HTML 확인과 서버리스 API 확인을 구분 |
| NOTES_SERVICE_NOT_CONFIGURED (503) | 서버 메모 서비스 설정 미완료 | 담당자가 비공개 서버 환경 확인. 비밀값을 문서에 적지 않음 |
| AUTH_REQUIRED (401) | 인증된 로그인 세션 없음 | 제공 로그인 화면에서 본인 계정과 세션 확인 |
| 기기 승인 대기/거부 | 서버 승인 자료 미확인 | 관리자 승인 상태 확인. 로컬 정보를 조작해 우회하지 않음 |
| 업무 앱 deny | 접근 정책상 거부 | reason, checkedAt 확인. 요청 자체의 error와 구분 |
| 접속/XDR 목록 비어 있음 | 현재 조회 범위 내 기록 없음 | 필터와 관측 범위 확인. error와 구별 |
| 기록 오류 / CONTRACT_MISMATCH | 조회 실패 또는 입력 계약 불일치 | 오래된 목록을 현재 결과로 보지 않고 제공 화면에서 직접 재조회 |
| AI ON_AI_PROVISIONING_PENDING | 운영 측 계정·권한 준비 중 | 담당자 확인. 성공 상태를 임의 표시하지 않음 |
| AI 인증·한도·이용 시간 오류 | 계정/반 사용량/허용 시간 문제 | 본인 연결 상태 확인 후 담당자 문의 |
| AI TIMEOUT / CANCELLED | 요청 시간 초과 또는 취소 | 이전 성공을 현재 결과로 보지 않고 제공 버튼으로 직접 다시 점검 |
| AI 설명 근거 불일치 / executed:true | 참고 설명을 사용할 수 없음 | 선택 기록 evidence.id와 인용 ID 대조. 자동 집행하지 않음 |
| 조치 pending / unknown | 서버가 받았을 뿐이거나 실제 효과 불명 | 성공으로 표시하지 않고 “연동 시스템 결과만 재조회”를 직접 사용 |
| OSV not_configured / not_checked | 승인 대상 설정 없음/미조회 | 담당자 확인. 패키지 버전을 임의 변경하지 않음 |
| OSV partial / unverifiable | 일부 실패/검증 불가 | 이미 받은 취약점 ID를 유지하고 미확인 범위를 별도 안내 |

자동 재시도·유료 AI 요청·실제 보안 조치·운영 환경 설정 변경을 학생 코드에서 수행하지 않습니다. 조치 화면 취소는 이미 서버에 전달된 조치를 되돌리는 기능이 아닙니다.

## 7. 직접 확인 기록·미확인 사항·제출 경계

| 항목 | 확인 방식 | 현재 상태 |
| --- | --- | --- |
| Node 최소 버전, npm 스크립트, 잠금 버전 | package.json·package-lock.json 원문 읽기 | 코드 확인 |
| 로컬 빌드 플래그 및 예상 출력 | scripts/build-public.mjs·scripts/deployment-identity.mjs 원문 읽기 | 코드 확인, 실행 미확인 |
| 폴더·메모 API·기기 승인 흐름 | GitHub 실제 파일 읽기 | 코드 확인 |
| 공개 앱 주소 | aleph.config.json의 publicAppUrl 읽기 | 설정값 확인, 실제 HTTP 접속 미확인 |
| 학생 함수 13~20단계 | student/extension.mjs 내용 확인 | 코드 확인, Bart 실제 화면 연동 미확인 |
| 사용자 PC에서 npm ci / 빌드 / 테스트 | 새 PowerShell 창에서 직접 실행 | 미확인 |
| 로컬 API·브라우저 로그인·SDP/XDR·AI 모델 호출·OSV 조회·실제 집행 | 실서버·인증·운영 연결 필요 | 미확인 |
| 21단계 공식 판정 통과 | ALEPH 과제 제출 화면 | 미확인 |

**직접 확인 1:** 사용자 PC의 새 PowerShell에서 먼저 2절의 node/npm/git 버전과 git rev-parse --show-toplevel을 확인합니다. 그다음 3절의 npm ci와 npm run build -- --local을 순서대로 진행하되, 결과가 실제 출력되기 전에는 완료로 적지 않습니다.

**21단계 제출:** 과제 화면에 GitHub 저장소 주소와 실제 40자리 커밋을 직접 입력합니다. 비공개 저장소에서 원문 묶음이 요구되는 경우에만 과제 화면의 “비공개 저장소 원문 준비 방법”을 열어 안내된 student-source-cli.mjs 명령과 개인 PC의 실제 경로를 확인해 사용합니다. 원문 전달 성공과 AI 심판 통과는 별개이며, 이 문서는 명령을 임의 추측하거나 원문을 제출하지 않습니다.
