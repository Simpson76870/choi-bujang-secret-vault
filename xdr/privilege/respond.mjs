import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const TTL_MS=30*60*1000;
export async function respond(fixture,result){
 const base=join(dirname(fileURLToPath(import.meta.url)),'..','..'), rulesPath=join(base,'xdr','privilege','deny-rules.json'), logPath=join(base,'xdr','alerts.log');
 let existing=[]; try{const parsed=JSON.parse(await readFile(rulesPath,'utf8'));existing=Array.isArray(parsed.rules)?parsed.rules:[]}catch(e){if(e?.code!=='ENOENT')throw e;}
 const byId=new Map(existing.filter(r=>r&&typeof r.alertId==='string').map(r=>[r.alertId,r])), alerts=new Map(fixture.alerts.map(a=>[a.id,a])), now=Date.now();
 for(const d of result.decisions){const a=alerts.get(d.alertId);if(!a)continue;
 await appendFile(logPath,JSON.stringify({timestamp:a.timestamp,alertId:a.id,action:d.action,confidence:d.confidence,reason:d.reason,account:a.data?.srcuser??''})+'\n','utf8');
 if(d.action!=='block'||d.confidence<0.85)continue; const account=a.data?.srcuser;if(typeof account!=='string'||!/^user\d{2}$/.test(account))continue;
 byId.set(a.id,{alertId:a.id,account,action:'revoke-session',reason:d.reason,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+TTL_MS).toISOString()});
 }
 await writeFile(rulesPath,JSON.stringify({schema:'aleph.xdr.session-revocations.v1',rules:[...byId.values()]},null,2)+'\n','utf8'); return {rules:[...byId.values()]};
}
