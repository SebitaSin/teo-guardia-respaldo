import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pack, unpack, safePath } from './scripts/archive.mjs';
const pass = 'frase-de-prueba-muy-larga-2026';
function source() {
  const root = mkdtempSync(join(tmpdir(),'guardia-archive-test-'));
  mkdirSync(join(root,'server')); mkdirSync(join(root,'src','data'),{recursive:true}); mkdirSync(join(root,'var','mail'),{recursive:true});
  writeFileSync(join(root,'server','users.local.json'),'[]');
  writeFileSync(join(root,'server','lab-credential.local.txt'),'no copiar como archivo');
  writeFileSync(join(root,'src','data','staff.json'),'{"services":{}}');
  writeFileSync(join(root,'var','mail','reclamos.json'),'{"test":true}');
  writeFileSync(join(root,'var','binario'),Buffer.from([0,1,2,255]));
  return root;
}
test('copia cifrada conserva binarios, usuarios, estado de reclamos y clave original',async()=>{
  const root=source(), path=join(root,'copia.guardia'), target=join(root,'restaurado');
  const count=await pack(root,path,pass,{APP_SESSION_SECRET:'s'.repeat(48),LAB_PASSWORD:'solo-dentro-del-cifrado'},'final');
  assert.equal(count,4);
  assert.equal(readFileSync(path).includes(Buffer.from('solo-dentro-del-cifrado')),false);
  const meta=await unpack(path,target,pass);
  assert.equal(meta.kind,'final'); assert.equal(meta.secrets.APP_SESSION_SECRET,'s'.repeat(48));
  assert.deepEqual(readFileSync(join(target,'var','binario')),Buffer.from([0,1,2,255]));
  assert.equal(existsSync(join(target,'server','lab-credential.local.txt')),false);
  assert.equal(readFileSync(join(target,'var','mail','reclamos.json'),'utf8'),'{"test":true}');
});
test('frase incorrecta no importa archivos',async()=>{
  const root=source(), path=join(root,'copia.guardia'), target=join(root,'mala');
  await pack(root,path,pass,{APP_SESSION_SECRET:'s'.repeat(48)});
  await assert.rejects(unpack(path,target,'otra-frase-distinta'),/incorrecta|alterada/);
  assert.equal(existsSync(join(target,'server')),false);
});
test('copia alterada no importa archivos',async()=>{
  const root=source(), path=join(root,'copia.guardia'),target=join(root,'alterada');
  await pack(root,path,pass,{APP_SESSION_SECRET:'s'.repeat(48)});
  const data=readFileSync(path); data[55]^=1;writeFileSync(path,data);
  await assert.rejects(unpack(path,target,pass),/incorrecta|alterada/);
  assert.equal(existsSync(join(target,'server')),false);
});
test('rechaza salir de la carpeta y archivos ajenos',()=>{
  const root=source();
  for(const path of ['../fuera','var/../fuera','C:/Windows/x','var/a:b','var/a\\b','server/session.secret','app.exe','var//x']) assert.throws(()=>safePath(root,path));
});
test('no reemplaza un archivo de respaldo existente',async()=>{
  const root=source(), path=join(root,'copia.guardia');writeFileSync(path,'anterior');
  await assert.rejects(pack(root,path,pass,{}),/ya existe/);assert.equal(readFileSync(path,'utf8'),'anterior');
});
test('rechaza frases de respaldo cortas',async()=>{
  const root=source();await assert.rejects(pack(root,join(root,'copia.guardia'),'corta',{}),/16 caracteres/);
});
test('preparacion conserva la ruta original aunque se archive una instantanea',async()=>{
  const root=source(),path=join(root,'preparacion.guardia'),target=join(root,'preparado');
  const original=join(root,'origen-real');
  await pack(root,path,pass,{APP_SESSION_SECRET:'s'.repeat(48)},'preparation',original);
  const meta=await unpack(path,target,pass);
  assert.equal(meta.kind,'preparation');assert.equal(meta.source,original);
});
test('incluye configuracion anidada de contingencia y rechaza otras subcarpetas',async()=>{
  const root=source();mkdirSync(join(root,'src/data/sch-resilience'),{recursive:true});
  writeFileSync(join(root,'src/data/sch-resilience/config.json'),'{"interno":true}');
  const path=join(root,'copia.guardia'),target=join(root,'destino');
  await pack(root,path,pass,{APP_SESSION_SECRET:'s'.repeat(48)});
  await unpack(path,target,pass);
  assert.equal(readFileSync(join(target,'src/data/sch-resilience/config.json'),'utf8'),'{"interno":true}');
  assert.throws(()=>safePath(root,'src/data/otra/config.json'));
});
