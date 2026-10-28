// Streaming, authenticated migration. Password/secrets come from stdin, never arguments.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'node:crypto';
import { createReadStream, createWriteStream, readFileSync, readdirSync, lstatSync, mkdirSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const MAGIC = Buffer.from('GUARDIA1');
const LIMIT = 128 * 1024 * 1024;
export function safePath(root, relative) {
  if (typeof relative !== 'string' || relative.includes('\\') || relative.includes(':') || relative.includes('\0') || relative.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Ruta de archivo no valida');
  if (!/^(var\/|src\/data\/[^/]+\.json$|src\/data\/sch-resilience\/(config|geo|pickups|roads|service-criticality)\.json$|server\/(users\.local\.json|photo-names\.json|ai-config\.json|avisos-config\.json|autogestion-config\.json|reclamos-config\.json)$)/.test(relative)) throw Error('Archivo fuera de la mudanza');
  const target = resolve(root, relative);
  if (!target.startsWith(resolve(root) + '\\') && !target.startsWith(resolve(root) + '/')) throw Error('Ruta fuera de destino');
  // Never follow a pre-existing symlink/reparse point inside the restore tree.
  let current = dirname(target);
  while (current !== resolve(root)) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw Error('Enlace no permitido');
    const parent = dirname(current); if (parent === current) throw Error('Ruta invalida'); current = parent;
  }
  return target;
}
function* walk(root, relative) {
  const full = join(root, relative);
  if (!existsSync(full)) return;
  const stat = lstatSync(full);
  if (stat.isSymbolicLink()) throw Error('No se copian enlaces: ' + relative);
  if (stat.isDirectory()) { for (const name of readdirSync(full)) yield* walk(root, relative + '/' + name); }
  else if (stat.isFile()) yield relative;
}
const keyFor = (password, salt) => scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
export async function pack(root, output, password, secrets, kind = 'final', originalSource = root) {
  if (password.length < 16) throw Error('Usa una frase de al menos 16 caracteres');
  if (existsSync(output)) throw Error('La copia ya existe');
  const salt = randomBytes(16), iv = randomBytes(12), header = Buffer.concat([MAGIC, salt, iv]);
  const cipher = createCipheriv('aes-256-gcm', keyFor(password, salt), iv); cipher.setAAD(header);
  const files = [...walk(root, 'var'), ...walk(root, 'src/data')].filter(p => p.startsWith('var/') || p.endsWith('.json'));
  for (const name of ['users.local.json', 'photo-names.json', 'ai-config.json', 'avisos-config.json', 'autogestion-config.json', 'reclamos-config.json']) if (existsSync(join(root, 'server', name))) files.push('server/' + name);
  // Validate the entire input before writing hundreds of MB and failing late.
  for(const path of files){safePath(root,path);if(lstatSync(join(root,path)).size>LIMIT)throw Error('Archivo demasiado grande: '+path);}
  const partial = output + '.incompleta';
  const stream = createWriteStream(partial, { flags: 'wx', mode: 0o600 });
  stream.write(header);
  async function* records() {
    yield JSON.stringify({ format: 1, at: new Date().toISOString(), source: resolve(originalSource), kind, secrets }) + '\n';
    for (const path of files) {
      safePath(root, path);
      if (lstatSync(join(root, path)).size > LIMIT) throw Error('Archivo demasiado grande: ' + path);
      const bytes = readFileSync(join(root, path));
      yield JSON.stringify({ path, sha256: createHash('sha256').update(bytes).digest('hex'), data: bytes.toString('base64') }) + '\n';
    }
  }
  await pipeline(Readable.from(records()), createGzip(), cipher, stream);
  // Tag is appended only after the cipher has fully completed.
  const { appendFileSync } = await import('node:fs'); appendFileSync(partial, cipher.getAuthTag());
  renameSync(partial, output);
  return files.length;
}
export async function unpack(input, target, password) {
  const stat = lstatSync(input);
  if (stat.size < 52) throw Error('Copia incompleta');
  const { openSync, readSync, closeSync } = await import('node:fs');
  const fd = openSync(input, 'r'), header = Buffer.alloc(36), tag = Buffer.alloc(16);
  try { readSync(fd, header, 0, 36, 0); readSync(fd, tag, 0, 16, stat.size - 16); } finally { closeSync(fd); }
  if (!header.subarray(0, 8).equals(MAGIC)) throw Error('Formato de copia desconocido');
  if (existsSync(target)) throw Error('El destino debe ser nuevo');
  mkdirSync(target, { recursive: true, mode: 0o700 });
  const verified = join(target, 'contenido.verificando');
  const decipher = createDecipheriv('aes-256-gcm', keyFor(password, header.subarray(8, 24)), header.subarray(24));
  decipher.setAAD(header); decipher.setAuthTag(tag);
  try { await pipeline(createReadStream(input, { start: 36, end: stat.size - 17 }), decipher, createWriteStream(verified, { flags: 'wx', mode: 0o600 })); }
  catch { if (existsSync(verified)) unlinkSync(verified); throw Error('Frase incorrecta o copia alterada. No se importo ningun dato.'); }
  const lines = createInterface({ input: createReadStream(verified).pipe(createGunzip()), crlfDelay: Infinity });
  let metadata = null, count = 0;
  for await (const line of lines) {
    if (line.length > LIMIT * 1.5) throw Error('Registro demasiado grande');
    const record = JSON.parse(line);
    if (!metadata) { if (record.format !== 1 || typeof record.secrets !== 'object') throw Error('Cabecera invalida'); metadata = record; continue; }
    const path = safePath(target, record.path), bytes = Buffer.from(record.data, 'base64');
    if (createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw Error('Archivo alterado');
    if (existsSync(path)) throw Error('Archivo repetido');
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 }); count++;
  }
  unlinkSync(verified);
  if (!metadata || !existsSync(join(target, 'server/users.local.json')) || String(metadata.secrets.APP_SESSION_SECRET || '').length < 32) throw Error('Faltan usuarios o la clave original de los datos');
  return { ...metadata, count };
}
export function verifyData(root, secrets) {
  const secret = String(secrets.APP_SESSION_SECRET || '');
  if (secret.length < 32) throw Error('Falta la clave original');
  for (const name of ['staff.json','catalog.json','internacion.json']) JSON.parse(readFileSync(join(root,'src/data',name),'utf8').replace(/^\uFEFF/,''));
  const prefixes = new Set();
  for (const file of readdirSync(join(root,'server')).filter(p=>p.endsWith('.mjs'))) {
    const source=readFileSync(join(root,'server',file),'utf8');
    for (const m of source.matchAll(/\.update\(`([^`$]+):\$\{secret\}`\)/g)) prefixes.add(m[1]);
  }
  let checked=0, responses=null;
  for (const path of walk(root,'var')) {
    if (!path.endsWith('.enc.json')) continue;
    const box=JSON.parse(readFileSync(join(root,path),'utf8'));let plain=null;
    for(const prefix of prefixes) {
      try {const key=createHash('sha256').update(`${prefix}:${secret}`).digest();const d=createDecipheriv('aes-256-gcm',key,Buffer.from(box.iv,'base64'));d.setAuthTag(Buffer.from(box.tag,'base64'));plain=JSON.parse(Buffer.concat([d.update(Buffer.from(box.data,'base64')),d.final()]).toString('utf8'));break;}catch{}
    }
    if(plain===null) throw Error('No se pudo comprobar un archivo cifrado: '+path);
    checked++;
    if(path.endsWith('/autogestion.enc.json')) responses=Object.keys(plain.respuestas||{}).length;
  }
  return { encryptedFiles:checked, responses };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    let input = ''; for await (const chunk of process.stdin) input += chunk;
    const request = JSON.parse(input.replace(/^\uFEFF/, ''));
    if (process.argv[2] === 'source-check') {
      const {loadAuthConfig,issueSession}=await import(pathToFileURL(join(request.root,'server/auth.mjs')));
      const config=loadAuthConfig({APP_SESSION_SECRET:request.secrets.APP_SESSION_SECRET,APP_USERS_FILE:join(request.root,'server/users.local.json')});
      const user=config.users.find(u=>u.role==='DIRECTION')||config.users[0];
      const response=await fetch('http://127.0.0.1:8788/api/session',{headers:{cookie:`sch_session=${issueSession(user,config)}`},signal:AbortSignal.timeout(5000)});
      if(!response.ok || (await response.json()).id!==user.id) throw Error('El servidor del puerto 8788 no corresponde a esta carpeta. No se detuvo.');
      console.log('{"ok":true}');
    }
    else if (process.argv[2] === 'verify') console.log(JSON.stringify(verifyData(request.root,request.secrets)));
    else if (process.argv[2] === 'pack') console.log(JSON.stringify({ count: await pack(request.root, request.output, request.password, request.secrets, request.kind, request.originalSource || request.root) }));
    else if (process.argv[2] === 'unpack') {
      const result = await unpack(request.input, request.target, request.password);
      // Secrets only go through this private pipe into the wizard, never to its log.
      process.stdout.write(JSON.stringify(result));
    } else throw Error('Operacion desconocida');
  } catch (error) { process.stderr.write(String(error.message) + '\n'); process.exitCode = 1; }
}
