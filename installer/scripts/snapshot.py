"""Copy preparation state without stopping HTTP/tunnel. Hold mail's existing
advisory lock, use SQLite online backup, and retry if copied files changed.
"""
import json, shutil, sqlite3, sys, time, os
from pathlib import Path

def files(root):
    result={}
    for base in [root/'var',root/'src'/'data']:
        for path in base.rglob('*'):
            if path.is_symlink(): raise RuntimeError('No se copian enlaces')
            if not path.is_file(): continue
            rel=path.relative_to(root).as_posix()
            if rel=='var/mail/.sync.lock' or rel.endswith(('-wal','-shm','-journal')): continue
            if base.name=='data' and path.suffix!='.json': continue
            stat=path.stat();result[rel]=(stat.st_size,stat.st_mtime_ns)
    for name in ['users.local.json','photo-names.json','ai-config.json','avisos-config.json','autogestion-config.json','reclamos-config.json']:
        path=root/'server'/name
        if path.exists():
            stat=path.stat();result['server/'+name]=(stat.st_size,stat.st_mtime_ns)
    return result

def snapshot(root,target):
    root,target=Path(root).resolve(),Path(target).resolve()
    if target.exists(): raise RuntimeError('La carpeta de copia ya existe')
    target.mkdir(parents=True)
    lock=(root/'var'/'mail'/'.sync.lock').open('r+b')
    try:
        if os.name=='nt':
            import msvcrt
            for attempt in range(30):
                try: lock.seek(0);msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1);break
                except OSError:
                    if attempt==29: raise RuntimeError('El correo esta actualizando. Repetir cuando termine.')
                    time.sleep(1)
        else:
            import fcntl
            fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        for attempt in range(5):
            before=files(root)
            current=target/('intento-'+str(attempt+1));current.mkdir()
            for relative in before:
                source=root/relative;dest=current/relative;dest.parent.mkdir(parents=True,exist_ok=True)
                if source.suffix in ('.sqlite','.sqlite3','.db'):
                    with sqlite3.connect(source.as_uri()+'?mode=ro',uri=True) as a,sqlite3.connect(dest) as b:
                        a.backup(b)
                        if b.execute('PRAGMA integrity_check').fetchone()[0]!='ok': raise RuntimeError('Base de correo inconsistente')
                else: shutil.copy2(source,dest)
            if files(root)==before:
                print(json.dumps({'root':str(current),'files':len(before),'kind':'preparation','sourceActive':True,'createdAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}));return
            time.sleep(.5)
        raise RuntimeError('Hubo actualizaciones durante la copia. El origen sigue funcionando; repetir.')
    finally: lock.close()

if __name__=='__main__':
    try: snapshot(sys.argv[1],sys.argv[2])
    except Exception as e: print(str(e),file=sys.stderr);sys.exit(1)
