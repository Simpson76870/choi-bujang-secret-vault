# 보너스 xdr-01 저장점

- 탐지: `xdr/brute-force/decide.mjs`
- 가상 경보: `xdr/fixtures/brute-force.json` (28건)
- 대응: `xdr/brute-force/respond.mjs`
- 결과: `xdr/brute-force/result.json` (block 10 · alert 9 · record 9)
- 테스트: `npm run test:brute-force`
- 재현: `npm run xdr:run -- brute-force`

주의: 결과 JSON은 소스 로직 기준 계산 결과입니다. 현재 작업 환경에서 저장소를 clone하거나 Node 테스트를 실행할 수 없었으므로 실제 명령 실행·테스트 통과는 미확인입니다. 대응은 로컬 가상 규칙/로그만 생성하며 운영 방화벽이나 계정을 변경하지 않습니다.
