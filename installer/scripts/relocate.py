"""Rewrite source-root file references after a verified import, without touching encrypted data."""
import json, sqlite3, sys
from pathlib import Path

root, source = Path(sys.argv[1]).resolve(), sys.argv[2]
variants = sorted({source, source.replace('\\', '/')}, key=len, reverse=True)
def rewrite(value):
    if isinstance(value, str):
        for old in variants:
            if value == old or value.startswith(old + '/') or value.startswith(old + '\\'):
                return str(root) + value[len(old):]
        return value
    if isinstance(value, list): return [rewrite(v) for v in value]
    if isinstance(value, dict): return {k: rewrite(v) for k,v in value.items()}
    return value

for base in [root / 'var', root / 'src' / 'data']:
    for path in base.rglob('*.json'):
        if path.name.endswith('.enc.json'): continue
        obj = json.loads(path.read_text(encoding='utf-8-sig'))
        updated = rewrite(obj)
        if updated != obj: path.write_text(json.dumps(updated, ensure_ascii=False), encoding='utf-8')
for path in (root / 'var').rglob('*.sqlite*'):
    if path.suffix not in ('.db','.sqlite','.sqlite3'): continue
    with sqlite3.connect(path) as db:
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if 'attachments' in tables:
            for rowid, value in db.execute('SELECT rowid,path FROM attachments').fetchall():
                new = rewrite(value)
                if new != value: db.execute('UPDATE attachments SET path=? WHERE rowid=?', (new,rowid))
print('Rutas locales adaptadas; datos cifrados conservados.')
