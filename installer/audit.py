"""Check the final distribution, not the source workspace. Never print private names."""
from pathlib import Path
import hashlib,json,zipfile
root=Path(__file__).resolve().parents[1]
kit=root/'outputs'/'Guardia-Instalador'
manifest=json.loads((kit/'manifest.json').read_text('utf-8'))
files=manifest['files']
for name,digest in files.items():
    assert hashlib.sha256((kit/name).read_bytes()).hexdigest()==digest, name
    assert not name.startswith('app/var/'),name
    assert '.clixml' not in name and 'users.local' not in name and 'lab-credential' not in name and 'session.secret' not in name,name
expected={'imap_sync.py','ingest_pending.py','photo_reader.py','pdfgrid.py','reclamos.py','schedule_services.py'}
assert {p.name for p in (kit/'app'/'scripts').glob('*.py')}==expected
assert {p.name for p in (kit/'app'/'src'/'data').glob('*.json')}=={'service-labels.json'}
assert (kit/'recursos'/'guardia-hospital.ico').read_bytes()[:4]==b'\x00\x00\x01\x00'
assert (kit/'asistente'/'open.ps1').is_file()
assert (kit/'asistente'/'credentials.ps1').is_file()
with zipfile.ZipFile(root/'outputs'/'Guardia-Instalador.zip') as z:
    assert z.testzip() is None
    assert set(z.namelist())=={'Guardia-Instalador/'+p for p in files}|{'Guardia-Instalador/manifest.json'}
    for name,digest in files.items(): assert hashlib.sha256(z.read('Guardia-Instalador/'+name)).hexdigest()==digest,name
print(json.dumps({'files_verified':len(files),'private_files':0,'zip_ok':True}))
