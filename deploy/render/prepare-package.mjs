// Creates a new clean deployment directory. Does not start, stop or publish the app.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const output = resolve(process.argv[2] || join(root, 'outputs', `render-${Date.now()}`));
if (existsSync(output)) throw new Error('La carpeta de salida ya existe; no se sobrescribe');
if (!output.startsWith(join(root, 'outputs') + '/'.replace('/', process.platform === 'win32' ? '\\' : '/'))) {
  throw new Error('La salida debe quedar dentro de outputs');
}
mkdirSync(output, { recursive: true });
const copy = (from, to = from) => { mkdirSync(dirname(join(output, to)), { recursive: true }); cpSync(join(root, from), join(output, to), { recursive: true, filter: path => !/(^|[\\/])__pycache__([\\/]|$)|\.pyc$/.test(path) }); };
const build = spawnSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', join(output, 'dist')], { cwd: root, encoding: 'utf8' });
writeFileSync(join(output, '..', `${output.split(/[\\/]/).pop()}-build.log`), (build.stdout || '') + (build.stderr || ''));
if (build.status !== 0) throw new Error('La compilacion aislada fallo; consultar el registro local');
for (const entry of readdirSync(join(root, 'server'), { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs')) copy('server/' + entry.name);
}
for (const name of ['autogestion-client.js', 'autogestion-page.html', 'board-templates.json', 'lab-services.json']) copy('server/' + name);
for (const name of ['imap_sync', 'ingest_pending', 'pdfgrid', 'photo_reader', 'schedule_services', 'reclamos']) copy(`scripts/${name}.py`);
copy('scripts/vendor');
for (const name of ['bed-capacity.mjs', 'departments.ts', 'service-labels.json']) copy('src/data/' + name);
for (const name of ['Dockerfile', 'render.yaml', 'render-entrypoint.mjs', 'LEEME.md']) copy('deploy/render/' + name, name);
writeFileSync(join(output, 'package.json'), JSON.stringify({name:'guardia-schestakow-runtime',private:true,type:'module',scripts:{start:'node render-entrypoint.mjs'}},null,2)+'\n');
writeFileSync(join(output, '.dockerignore'), '.git\n*.log\nMANIFEST.json\nLEEME.md\n');
const manifest = [];
function scan(dir) {
  for (const entry of readdirSync(dir, {withFileTypes:true})) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) { scan(file); continue; }
    const name = relative(output, file).replaceAll('\\','/');
    if (/(^|\/)(var|private|\.env|node_modules|__pycache__)(\/|$)|\.clixml$|\.local\.|session\.secret|src\/data\/(catalog|internacion|lab-pacientes|legajos|staff|inbox|mail-sync)\.json$/.test(name)) throw new Error('Archivo privado o innecesario en el paquete: ' + name);
    const bytes = readFileSync(file);
    if (/\.(m?js|json|html|css|py|yaml|md)$/.test(name) && /AIza[0-9A-Za-z_-]{35}|sk-(?:proj-)?[A-Za-z0-9_-]{32,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(bytes.toString('utf8'))) throw new Error('Posible secreto en: ' + name);
    manifest.push({path:name,bytes:statSync(file).size,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
}
scan(output);
writeFileSync(join(output,'MANIFEST.json'),JSON.stringify({createdAt:new Date().toISOString(),privateDataIncluded:false,secretsIncluded:false,files:manifest},null,2)+'\n');
console.log(JSON.stringify({output,files:manifest.length,bytes:manifest.reduce((s,f)=>s+f.bytes,0),published:false}));
