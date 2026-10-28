// A preparation deployment never loads the hospital app or its background jobs.
import { createServer } from 'node:http';
import { existsSync, readFileSync, mkdirSync, symlinkSync, lstatSync, readlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(process.env.APP_ROOT || process.cwd());
const mode = process.env.GUARDIA_MODE || 'preparacion';
if (!['preparacion', 'produccion'].includes(mode)) throw new Error('GUARDIA_MODE invalido');

if (mode === 'preparacion') {
  const server = createServer((req, res) => {
    const health = req.method === 'GET' && req.url === '/api/health';
    res.writeHead(health ? 200 : 503, {
      'content-type': health ? 'application/json' : 'text/plain; charset=utf-8',
      'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow',
    });
    res.end(health ? JSON.stringify({ ok: true, operational: false, stage: 'preparacion' })
      : 'Guardia: traspaso en preparacion. La aplicacion aun no esta habilitada aqui.');
  });
  server.listen(Number(process.env.PORT || process.env.APP_PORT || 10000), process.env.APP_HOST || '0.0.0.0');
  process.once('SIGTERM', () => server.close());
} else {
  const privateDir = resolve(process.env.APP_PRIVATE_DIR || '/var/data/private');
  const marker = join(privateDir, 'migration-verified.json');
  if (!existsSync(marker)) throw new Error('Falta verificar la importacion privada y coordinar el corte');
  const imported = JSON.parse(readFileSync(marker, 'utf8'));
  if (imported.sourceBackgroundStopped !== true || imported.pathsConverted !== true || imported.dataValidated !== true) {
    throw new Error('La migracion no confirma origen detenido, rutas convertidas y datos verificados');
  }
  const secret = String(process.env.APP_SESSION_SECRET || '').trim();
  if (secret.length < 32 || createHash('sha256').update(secret).digest('hex') !== imported.sessionSecretSha256) {
    throw new Error('Se requiere la clave original que protege los datos importados');
  }
  const files = ['catalog', 'internacion', 'lab-pacientes', 'legajos', 'staff', 'inbox', 'mail-sync'];
  const configurations = ['ai-config', 'autogestion-config', 'avisos-config', 'reclamos-config', 'photo-names'];
  const links = [
    ...files.map(name => [join(privateDir, 'baseline', name + '.json'), join(root, 'src', 'data', name + '.json')]),
    ...configurations.map(name => [join(privateDir, 'config', name + '.json'), join(root, 'server', name + '.json')]),
  ];
  // Complete validation before touching the deployed filesystem or starting jobs.
  for (const [source] of links) JSON.parse(readFileSync(source, 'utf8'));
  process.env.APP_USERS_FILE ||= join(privateDir, 'users.local.json');
  const { loadAuthConfig } = await import(pathToFileURL(join(root, 'server', 'auth.mjs')));
  loadAuthConfig();
  for (const [source, target] of links) {
    mkdirSync(resolve(target, '..'), { recursive: true });
    const current = lstatSync(target, { throwIfNoEntry: false });
    if (current?.isSymbolicLink() && resolve(dirnameOf(target), readlinkSync(target)) === resolve(source)) continue;
    if (current) throw new Error('Ruta privada inesperada en la imagen');
    symlinkSync(source, target, 'file');
  }
  process.env.APP_ROOT = root;
  process.env.APP_DATA_DIR ||= '/var/data/runtime';
  process.env.APP_HOST ||= '0.0.0.0';
  // Skip model comparisons on a restart; do not spend money just to deploy.
  process.env.AI_COMPARE = 'false';
  await import(pathToFileURL(join(root, 'server', 'start.mjs')));
}

function dirnameOf(file) { return resolve(file, '..'); }
