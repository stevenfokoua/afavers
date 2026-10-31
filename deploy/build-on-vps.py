"""Temporary capped build job, launched under the VPS resource runner/scope."""
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request
import zipfile

root=Path('/opt/afavers')
owner=os.environ['AGENT_RESOURCE_OWNER']
work=root/'build-context'
receipt=root/'build-receipt.json'
if work.exists():
    if not (work/'.owner').is_file() or (work/'.owner').read_text().strip()!=owner:
        raise SystemExit('Refusing to reuse an unowned build directory')
else:
    work.mkdir()
    (work/'.owner').write_text(owner)
logs=root/'build-logs'
logs.mkdir(exist_ok=True)
release=root/'frontend-release'
if release.exists():
    raise SystemExit('Existing frontend release preserved; choose an explicit replacement')

def extract(path,dest):
    with tarfile.open(path) as archive:
        for member in archive.getmembers():
            target=(dest/member.name).resolve()
            if not target.is_relative_to(dest.resolve()) or member.issym() or member.islnk() or not (member.isfile() or member.isdir()):
                raise ValueError('Unsafe archive member')
        archive.extractall(dest,filter='data')

checks=[]
try:
    extract(root/'build-source.tar.gz',work)
    version='v22.23.4'
    archive=f'node-{version}-linux-x64.tar.xz'
    url=f'https://nodejs.org/dist/{version}/'
    urllib.request.urlretrieve(url+archive,work/archive)
    checksums=urllib.request.urlopen(url+'SHASUMS256.txt',timeout=30).read().decode()
    expected=next(line.split()[0] for line in checksums.splitlines() if line.endswith(' '+archive))
    if hashlib.sha256((work/archive).read_bytes()).hexdigest()!=expected:
        raise ValueError('Node runtime checksum mismatch')
    # The official Node archive contains relative npm/npx symlinks. Python's
    # data filter prevents links escaping the destination directory.
    with tarfile.open(work/archive) as node:
        node.extractall(work,filter='data')
    runtime=work/f'node-{version}-linux-x64/bin'
    env=os.environ.copy()
    env['PATH']=str(runtime)+os.pathsep+env['PATH']
    env['NODE_OPTIONS']='--max-old-space-size=512'
    env['npm_config_cache']=str(root/'build-cache/npm')
    env.update(dict(line.split('=',1) for line in (root/'frontend.env').read_text().splitlines() if line))
    env['VITE_APP_VERSION']=(work/'SOURCE_VERSION').read_text().strip()
    def run(name,command,cwd=work):
        print('Starting',name,flush=True)
        with (logs/f'{name}.log').open('w') as log:
            result=subprocess.run(command,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=600)
        checks.append({'name':name,'exitCode':result.returncode})
        receipt.write_text(json.dumps({'owner':owner,'checks':checks,'workRetired':False},indent=2))
        if result.returncode:
            raise RuntimeError(f'{name} failed; see its bounded build log')
    run('install',['npm','ci','--no-audit','--no-fund'])
    run('unit-tests',['npm','test','--workspace=client','--','--maxWorkers=1','--pool=threads'])
    run('production-build',['npm','run','build'])
    run('extension-install',['npm','ci' if (work/'extension/package-lock.json').exists() else 'install','--no-audit','--no-fund'],work/'extension')
    run('extension-build',['npm','run','build'],work/'extension')
    config={'SUPABASE_URL':env['VITE_SUPABASE_URL'],'SUPABASE_ANON_KEY':env['VITE_SUPABASE_ANON_KEY'],'DASHBOARD_URL':'https://afavers.saintcreators.com/jobs'}
    (work/'extension/config.js').write_text('self.__AFAVERS_CONFIG__ = '+json.dumps(config)+';\n')
    manifest=json.loads((work/'extension/manifest.json').read_text())
    manifest['host_permissions']=[value for value in manifest['host_permissions'] if 'YOUR-PROJECT-REF' not in value]+['https://afavers.saintcreators.com/*']
    (work/'extension/manifest.json').write_text(json.dumps(manifest,indent=2))
    release.mkdir()
    shutil.copytree(work/'client/dist',release,dirs_exist_ok=True)
    with zipfile.ZipFile(release/'afavers-chrome-extension.zip','w',zipfile.ZIP_DEFLATED) as package:
        for name in ['manifest.json','popup.html','popup.css','popup.bundle.js','config.js','content.js']:
            package.write(work/'extension'/name,name)
        for image in (work/'extension/icons').glob('*.png'): package.write(image,'icons/'+image.name)
    hashes={}
    for path in release.rglob('*'):
        if path.is_file():
            content=path.read_bytes()
            hashes[path.relative_to(release).as_posix()]=hashlib.sha256(content).hexdigest()
            if path.suffix in ('.js','.css','.svg','.json','.html') and len(content)>1024:
                compressed=gzip.compress(content,compresslevel=9,mtime=0)
                if len(compressed)<len(content): path.with_name(path.name+'.gz').write_bytes(compressed)
    (release/'release-sha256.json').write_text(json.dumps(hashes,indent=2))
    # Preserve the dependency lock created for the extension for reproducibility.
    shutil.copyfile(work/'extension/package-lock.json',root/'extension-package-lock.json')
    print('Production frontend and configured extension exported',flush=True)
finally:
    if work.resolve()==Path('/opt/afavers/build-context') and (work/'.owner').read_text().strip()==owner:
        shutil.rmtree(work)
    receipt.write_text(json.dumps({'owner':owner,'checks':checks,'workRetired':not work.exists()},indent=2))
    print('Temporary build context/runtime retired',flush=True)
