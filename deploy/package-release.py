"""Package an already built frontend; no database, Docker or remote writes."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import tarfile

parser = argparse.ArgumentParser()
parser.add_argument('--dist', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
dist = args.dist.resolve()
if not (dist / 'index.html').is_file() or not (dist / 'version.json').is_file():
    parser.error('A successful production build with index.html and version.json is required')
if args.out.exists():
    parser.error('Refusing to overwrite an existing release archive')
files = sorted(path for path in dist.rglob('*') if path.is_file())
manifest = {}
with tarfile.open(args.out, 'w:gz') as archive:
    for path in files:
        if path.is_symlink():
            raise ValueError('Symlinks are not allowed in a static release')
        name = path.relative_to(dist).as_posix()
        if any(part.startswith('.') for part in path.relative_to(dist).parts) or path.suffix in ('.map', '.env'):
            continue
        content = path.read_bytes()
        manifest[name] = hashlib.sha256(content).hexdigest()
        info = tarfile.TarInfo(name)
        info.mode = 0o644
        info.size = len(content)
        archive.addfile(info, io.BytesIO(content))
        if path.suffix in ('.js', '.css', '.svg', '.json', '.html') and len(content) > 1024:
            compressed = gzip.compress(content, compresslevel=9, mtime=0)
            if len(compressed) < len(content):
                info = tarfile.TarInfo(name + '.gz')
                info.mode = 0o644
                info.size = len(compressed)
                archive.addfile(info, io.BytesIO(compressed))
    payload = json.dumps(manifest, indent=2).encode()
    info = tarfile.TarInfo('release-sha256.json')
    info.mode = 0o644
    info.size = len(payload)
    archive.addfile(info, io.BytesIO(payload))
print(f'Packaged {len(manifest)} files; {args.out.stat().st_size} bytes')
