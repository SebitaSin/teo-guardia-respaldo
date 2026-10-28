"""Build an offline Windows x64 kit. No production data or credentials are copied."""
from pathlib import Path
import hashlib, json, shutil, urllib.request, zipfile, sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs' / 'Guardia-Instalador'
CACHE = ROOT / 'installer' / 'downloads'
NODE = '24.22.1'
PYTHON = '3.14.10'

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()

def download(name, url, expected=None):
    target = CACHE / name
    if not target.exists():
        print('Descargando', name, flush=True)
        request = urllib.request.Request(url, headers={'User-Agent': 'Guardia-Installer/1.0'})
        with urllib.request.urlopen(request, timeout=120) as response, target.open('wb') as f:
            shutil.copyfileobj(response, f)
    if expected and sha(target) != expected: raise ValueError('Huella incorrecta: ' + name)
    return target

def build():
    refresh = '--refresh' in sys.argv
    if OUT.exists() and not refresh: raise SystemExit('La salida ya existe. Usar --refresh solo para regenerar este paquete de codigo sin datos.')
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    node_name = f'node-v{NODE}-win-x64.zip'
    sums = urllib.request.urlopen(f'https://nodejs.org/dist/v{NODE}/SHASUMS256.txt').read().decode()
    node_hash = next(line.split()[0] for line in sums.splitlines() if line.endswith('  ' + node_name))
    nodezip = download(node_name, f'https://nodejs.org/dist/v{NODE}/{node_name}', node_hash)
    pyzip = download(f'python-{PYTHON}-embed-amd64.zip', f'https://www.python.org/ftp/python/{PYTHON}/python-{PYTHON}-embed-amd64.zip', '90905e64a840557d8c1bc4f5b74db3d7ee85e3ffb217611cac1c7813acea4159')
    pillow = download('pillow-13.0.0-cp314-cp314-win_amd64.whl', 'https://files.pythonhosted.org/packages/50/e2/7ad17747517e4c813dca78257d6bb593466f8231baf1384bc98d92745edb/pillow-13.0.0-cp314-cp314-win_amd64.whl', 'f7cbb7a64e7ec664775195e4f81923bc8a93d9451b963f844e59118f63147a7a')
    with zipfile.ZipFile(nodezip) as z:
        prefix = f'node-v{NODE}-win-x64/'
        for name in ['node.exe', 'LICENSE']:
            dest = OUT / 'runtime' / 'node' / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(z.read(prefix + name))
    with zipfile.ZipFile(pyzip) as z: z.extractall(OUT / 'runtime' / 'python')
    with zipfile.ZipFile(pillow) as z: z.extractall(OUT / 'runtime' / 'python' / 'Lib' / 'site-packages')
    (OUT / 'runtime' / 'python' / 'python314._pth').write_text('python314.zip\n.\nLib/site-packages\n../../app/scripts\n../../app/scripts/vendor\nimport site\n', encoding='utf-8')
    downloads = {
        'vc_redist.x64.exe': 'https://aka.ms/vs/17/release/vc_redist.x64.exe',
        'chrome-x64.msi': 'https://dl.google.com/dl/chrome/install/googlechromestandaloneenterprise64.msi',
        'chrome-remote-desktop.msi': 'https://dl.google.com/edgedl/chrome-remote-desktop/chromeremotedesktophost.msi',
    }
    for name, url in downloads.items():
        dest = OUT / 'prerequisitos' / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(download(name, url), dest)
    shutil.copytree(ROOT / 'installer' / 'scripts', OUT / 'asistente', dirs_exist_ok=True, ignore=shutil.ignore_patterns('*.test.ps1'))
    for file in (ROOT / 'installer').glob('*.cmd'): shutil.copy2(file, OUT / file.name)
    shutil.copy2(ROOT / 'installer' / 'LEEME.txt', OUT / 'LEEME.txt')
    (OUT / 'recursos').mkdir(exist_ok=True)
    shutil.copy2(ROOT / 'tools' / 'guardia-hospital.ico', OUT / 'recursos' / 'guardia-hospital.ico')
    app = OUT / 'app'
    app.mkdir(exist_ok=True)
    shutil.copy2(ROOT / 'package.json', app / 'package.json')
    # Explicit allowlists. Never copy .env, var, arbitrary server files, or src private JSON.
    shutil.copytree(ROOT / 'dist', app / 'dist', dirs_exist_ok=True)
    (app / 'server').mkdir(exist_ok=True)
    for file in (ROOT / 'server').glob('*.mjs'):
        if '.test.' not in file.name and '.local-' not in file.name:
            shutil.copy2(file, app / 'server' / file.name)
    for name in ['board-templates.json', 'lab-services.json']:
        shutil.copy2(ROOT / 'server' / name, app / 'server' / name)
    for name in ['autogestion-client.js', 'autogestion-page.html']:
        shutil.copy2(ROOT / 'server' / name, app / 'server' / name)
    (app / 'src' / 'data').mkdir(parents=True, exist_ok=True)
    for name in ['bed-capacity.mjs', 'service-labels.json']:
        shutil.copy2(ROOT / 'src' / 'data' / name, app / 'src' / 'data' / name)
    (app / 'scripts').mkdir(exist_ok=True)
    for name in ['imap_sync.py','ingest_pending.py','photo_reader.py','pdfgrid.py','reclamos.py','schedule_services.py']:
        shutil.copy2(ROOT / 'scripts' / name, app / 'scripts' / name)
    shutil.copytree(ROOT / 'scripts' / 'vendor', app / 'scripts' / 'vendor', ignore=shutil.ignore_patterns('__pycache__', '*.pyc'), dirs_exist_ok=True)
    (OUT / 'runtime' / 'cloudflare').mkdir(exist_ok=True)
    shutil.copy2(ROOT / 'tools' / 'cloudflared.exe', OUT / 'runtime' / 'cloudflare' / 'cloudflared.exe')
    for path in OUT.rglob('*'):
        relative = path.relative_to(OUT).as_posix()
        if path.is_file() and (relative.startswith('app/var/') or relative.startswith('app/src/data/') and path.suffix == '.json' and path.name != 'service-labels.json' or relative.endswith(('.clixml','.secret','.env')) or path.name in ('users.local.json','lab-credential.local.txt','photo-names.json','parte-2026-09-02.py')):
            raise ValueError('Archivo privado inesperado en salida: ' + relative)
    files = {p.relative_to(OUT).as_posix(): sha(p) for p in sorted(OUT.rglob('*')) if p.is_file() and p.name != 'manifest.json'}
    manifest = {'format': 1, 'installerRevision': '2026-10-27-R6', 'node': NODE, 'python': PYTHON, 'files': files,
                'sources': {'node': f'https://nodejs.org/dist/v{NODE}/', 'python': f'https://www.python.org/downloads/release/python-{PYTHON.replace(".", "")}/', **downloads}}
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    archive = ROOT / 'outputs' / 'Guardia-Instalador.zip'
    if archive.exists() and not refresh: raise SystemExit('El ZIP ya existe; no se sobreescribe.')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in OUT.rglob('*'):
            if p.is_file(): z.write(p, 'Guardia-Instalador/' + p.relative_to(OUT).as_posix())
    print(json.dumps({'files': len(files), 'zip_bytes': archive.stat().st_size, 'output': str(OUT)}))

if __name__ == '__main__': build()
