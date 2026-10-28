import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(process.argv[2]);
const source = resolve(process.argv[3]);
const manifest = JSON.parse(readFileSync(join(root, 'MANIFEST.json'), 'utf8'));
for (const file of manifest.files) {
  const bytes = readFileSync(join(root, file.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
}
// Compare exact private identifiers locally; never log the values.
const privateValues = new Set();
function collect(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach(collect); return; }
  for (const [key, item] of Object.entries(value)) {
    if (['paciente', 'paciente_original', 'paciente_oficial', 'dni', 'lab_dni', 'phone'].includes(key) && typeof item === 'string' && item.trim().length >= 8) privateValues.add(item.trim());
    if (item && typeof item === 'object') collect(item);
  }
  if (typeof value.surname === 'string' && typeof value.name === 'string') {
    const name = `${value.surname} ${value.name}`.trim();
    if (name.length > 12) privateValues.add(name);
  }
}
for (const name of ['internacion', 'staff', 'lab-pacientes', 'legajos']) {
  const file = join(source, 'src/data', `${name}.json`);
  if (existsSync(file)) collect(JSON.parse(readFileSync(file, 'utf8')));
}
const leaks = [];
for (const file of manifest.files.filter(f => f.path.startsWith('dist/') && /\.(js|json|html|css)$/.test(f.path))) {
  const body = readFileSync(join(root, file.path), 'utf8');
  if ([...privateValues].some(value => body.includes(value))) leaks.push(file.path);
}
assert.deepEqual(leaks, [], 'El frontend contiene identificadores privados');

const portProbe = createServer();
await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, APP_ROOT: root, APP_HOST: '127.0.0.1', PORT: String(port), GUARDIA_MODE: 'preparacion' };
const child = spawn(process.execPath, ['render-entrypoint.mjs'], {cwd:root,env,stdio:['ignore','ignore','pipe'],windowsHide:true});
let error=''; child.stderr.on('data', data => error += data);
let exited = false;
const closed = new Promise(resolve => child.once('exit', code => {exited=true;resolve(code);}));
try {
  let response;
  for(let i=0;i<50;i++) {
    if(exited) throw new Error('Fallo el arranque de preparacion: '+error);
    try {response=await fetch(`http://127.0.0.1:${port}/api/health`);break;} catch {await new Promise(resolve=>setTimeout(resolve,100));}
  }
  assert.ok(response, 'No arranco en tiempo');
  assert.deepEqual(await response.json(), {ok:true,operational:false,stage:'preparacion'});
  for(const path of ['/','/login','/api/bootstrap','/mis-datos']) {
    const result=await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(result.status,503,path);
    assert.equal(result.headers.get('cache-control'),'no-store');
  }
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/login`,{method:'POST',body:'test'})).status,503);
  assert.equal(existsSync(join(root,'var')),false,'El modo preparacion no crea ni procesa datos');
} finally {if(!exited) child.kill(); await closed;}
const failed = spawn(process.execPath,['render-entrypoint.mjs'],{cwd:root,env:{...env,GUARDIA_MODE:'produccion',APP_PRIVATE_DIR:join(root,'nonexistent-private')},stdio:'ignore',windowsHide:true});
assert.notEqual(await new Promise(resolve=>failed.once('exit',resolve)),0,'Produccion debe bloquearse sin importacion validada');
console.log(JSON.stringify({verifiedFiles:manifest.files.length,privateIdentifierChecks:privateValues.size,privateIdentifiersInFrontend:0,preparationIsolated:true,productionBlockedWithoutImport:true,cloudContainerTested:false}));
