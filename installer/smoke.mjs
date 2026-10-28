// Isolated package smoke test. Does not read production data or call external integrations.
import { cpSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const kit=resolve(process.argv[2]);
const root=mkdtempSync(resolve('_backups/2026-10-26-instalador/smoke-'));
cpSync(join(kit,'app'),root,{recursive:true});
for(const [name,obj] of Object.entries({'staff.json':{services:{}},'catalog.json':{documents:[]},'internacion.json':{beds:[]},'legajos.json':{rows:[]},'lab-pacientes.json':{patients:[]},'inbox.json':{messages:[]},'mail-sync.json':{}})) writeFileSync(join(root,'src/data',name),JSON.stringify(obj));
mkdirSync(join(root,'var'),{recursive:true});
process.chdir(root); process.env.APP_ROOT=root; process.env.APP_DATA_DIR=join(root,'var'); process.env.GMAIL_SYNC_ENABLED='false';process.env.AI_ENABLED='false';
const {createHospitalServer}=await import(pathToFileURL(join(root,'server/app.mjs')));
const {hashPassword,issueSession}=await import(pathToFileURL(join(root,'server/auth.mjs')));
const users=[{id:'prueba',name:'Prueba interna',role:'DIRECTION',passwordHash:hashPassword('solo-para-prueba-interna'),staffId:null}];
const authConfig={secret:'s'.repeat(48),users,secureCookie:false,trustProxy:false,sessionHours:1};
const server=createHospitalServer({distDir:join(root,'dist'),dataDir:join(root,'var'),catalogFile:join(root,'src/data/catalog.json'),internacionFile:join(root,'src/data/internacion.json'),authConfig,waConfig:{},ai:{enabled:false},maps:{serverKey:''}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
try{
  const checks=[];
  for(const [route,status] of [['/api/health',200],['/login',200],['/mis-datos',200],['/mis-datos.js',200],['/api/bootstrap',401],['/mi-ubicacion',404]]){const r=await fetch(base+route,{redirect:'manual'});assert.equal(r.status,status,route); checks.push(route);}
  const cookie=`sch_session=${issueSession(users[0],authConfig)}`;
  const response=await fetch(base+'/api/bootstrap',{headers:{cookie}});assert.equal(response.status,200);await response.json();checks.push('bootstrap autenticado');
  console.log(JSON.stringify({ok:true,checks,isolated:root}));
}finally{await new Promise(r=>server.close(r));}
