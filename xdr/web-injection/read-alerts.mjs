import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureUrl = new URL('../fixtures/web-injection.json', import.meta.url);

// 설명에 섞일 수 있는 인증 정보·연락처·개인키와 제어 문자를 제거합니다.
export function safeDescription(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/-----BEGIN[\s\S]*?-----END[^\n]*-----/g, '[redacted]')
    .replace(/\b(?:password|passwd|token|secret|api[_-]?key|authorization|비밀번호|토큰|키)\s*[:=]\s*[^\s,;]+/gi, '[redacted]')
    .replace(/\bBearer\s+\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|\b(?:sb_secret_|sb_publishable_|sk-)[\w-]+/g, '[redacted]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted]')
    .replace(/\b[A-Za-z0-9_+/-]{32,}\b/g, '[redacted]')
    .replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, 500);
}

// 확인 화면에는 요청 본문·URL을 내보내지 않고 지정된 다섯 필드만 반환합니다.
export function extractAlert(alert) {
  const time = Date.parse(alert?.timestamp);
  const ip = alert?.data?.srcip;
  return {
    timestamp: Number.isFinite(time) ? new Date(time).toISOString() : null,
    sourceAddress: typeof ip === 'string' && /^(192\.0\.2|198\.51\.100|203\.0\.113)\.(?:\d{1,3})$/.test(ip)
      && Number(ip.split('.').at(-1)) <= 255 ? ip : '[redacted]',
    account: /^user\d{2,4}$/.test(alert?.data?.srcuser ?? '') ? alert.data.srcuser : '[redacted]',
    level: Number.isInteger(alert?.rule?.level) && alert.rule.level >= 0 && alert.rule.level <= 15
      ? alert.rule.level : null,
    description: safeDescription(alert?.rule?.description),
  };
}

// 원본 파일은 읽기만 하며 경보 한 건을 추출 결과 한 줄에 대응시킵니다.
export async function readAlerts(url = fixtureUrl) {
  const fixture = JSON.parse(await readFile(url, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== 'web-injection'
    || !Array.isArray(fixture.alerts)) throw new Error('invalid_web_injection_fixture');
  return fixture.alerts.map(extractAlert);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = await readAlerts();
  for (const row of rows) console.log(JSON.stringify(row));
  console.error(`경보 ${rows.length}건 · 추출 ${rows.length}줄`);
}
