"""Export only public browser configuration; never export service credentials."""
from pathlib import Path

root = Path('/opt/afavers')
values = dict(line.split('=', 1) for line in (root/'.env').read_text().splitlines() if line)
path = root/'frontend.env'
path.write_text('VITE_SUPABASE_URL=https://afavers.saintcreators.com/backend\n'
                f'VITE_SUPABASE_ANON_KEY={values["ANON_KEY"]}\n'
                'VITE_DEMO_EMAIL=demo@afavers.saintcreators.com\n')
path.chmod(0o600)
print('Frontend configuration exported; private backend credentials excluded')
