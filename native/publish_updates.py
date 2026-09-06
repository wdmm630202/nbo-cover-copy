# -*- coding: utf-8 -*-
"""Create a content-addressed web release and atomically publish its manifest."""
import hashlib,json,shutil,sys,os,tempfile,re
from pathlib import Path

def publish(web,output):
    web,output=Path(web),Path(output)
    files=[]
    for path in sorted(web.rglob('*')):
        if path.is_symlink():raise ValueError('Symlinks are not release assets')
        if not path.is_file():continue
        data=path.read_bytes();relative=path.relative_to(web).as_posix()
        if not re.fullmatch(r'[A-Za-z0-9_./-]{1,240}',relative) or any(part in ['.','..',''] for part in relative.split('/')) or relative=='manifest.json':raise ValueError('Unsupported asset path: '+relative)
        if len(data)>8*1024*1024:raise ValueError('Asset exceeds native limit: '+relative)
        files.append({'path':relative,'size':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    if not files or len(files)>128 or sum(f['size'] for f in files)>20*1024*1024:raise ValueError('Release exceeds native limits')
    canonical=json.dumps(files,sort_keys=True,separators=(',',':')).encode()
    version=hashlib.sha256(canonical).hexdigest()
    destination=output/'versions'/version
    destination.parent.mkdir(parents=True,exist_ok=True)
    if not destination.exists():
        stage=Path(tempfile.mkdtemp(prefix='.stage-',dir=destination.parent))
        try:
            for f in files:
                target=stage/f['path'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(web/f['path'],target)
                if hashlib.sha256(target.read_bytes()).hexdigest()!=f['sha256']:raise ValueError('Source changed during publish')
            stage.rename(destination)
        finally:
            if stage.exists():shutil.rmtree(stage)
    else:
        for f in files:
            if hashlib.sha256((destination/f['path']).read_bytes()).hexdigest()!=f['sha256']:raise ValueError('Immutable release was modified')
    manifest={'schema':1,'bridgeVersion':1,'version':version,'files':files}
    fd,name=tempfile.mkstemp(prefix='.manifest-',dir=output)
    try:
        with os.fdopen(fd,'w') as stream:json.dump(manifest,stream,ensure_ascii=False,separators=(',',':'))
        os.replace(name,output/'manifest.json')
    finally:
        if os.path.exists(name):os.unlink(name)
    return version
if __name__=='__main__':
    print(publish(sys.argv[1] if len(sys.argv)>1 else 'native/Web',sys.argv[2] if len(sys.argv)>2 else 'work/site/app-updates'))
