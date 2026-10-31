"""Run the compiled app against a disposable self-hosted DB/Auth/REST stack.

On the user's PC enter through the documented resource runner with --docker
--heavy. GitHub-hosted jobs use the same labelled ownership manifest directly.
No production credentials, database, network, mail relay or volume are reused.
"""
from __future__ import annotations
import argparse, base64, hashlib, hmac, json, os, secrets, socket, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
COMPOSE = REPO / 'deploy/ci/compose.yml'
STATE_ROOT = REPO / '.ci-runtime'
# Manifest digests verified against Docker Hub Registry v2 (Linux/amd64 present).
# Keep in step with the image references in compose.yml.
IMAGES = [
    'supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00',
    'supabase/gotrue:v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b',
    'postgrest/postgrest:v14.18@sha256:c7cd7e265a85b05248abf53f4473fcec7e327c282d0bd0cf60f1551996d09fcf',
    'axllent/mailpit:v1.32.0@sha256:0790692be935ea4420d085694f7985b1f692ca6a8771ab0e0bd8ba75ac180498',
    'nginx:1.30.6-alpine@sha256:0e52bd054126cdc040b1276c0af347aeb02a41b9cfe305d6094767ac30e97949',
]

def command(argv, *, data=None, env=None, check=True, cwd=REPO):
    result = subprocess.run(argv, input=data, text=True, capture_output=True, env=env, cwd=cwd)
    if check and result.returncode:
        raise RuntimeError(f'{argv[0]} failed (exit {result.returncode}):\n{result.stderr[-3000:]}')
    return result

def compose(state, *args, **kwargs):
    return command(['docker', 'compose', '--project-name', state['project'], '--env-file', str(Path(state['root']) / 'backend.env'), '-f', str(COMPOSE), *args], **kwargs)

def write_state(state):
    path = Path(state['root']) / 'state.json'
    path.write_text(json.dumps(state, indent=2))
    (STATE_ROOT / 'active.json').write_text(json.dumps({'state': str(path)}))

def owned(state, kind, names):
    for name in names:
        values = json.loads(command(['docker', kind, 'inspect', name]).stdout)
        for value in values:
            labels = value.get('Config', {}).get('Labels', {}) if kind == 'container' else value.get('Labels', {})
            assert labels.get('local.agent.owner') == state['owner'], f'Owner mismatch on {kind}'
            assert labels.get('local.agent.lifecycle') == 'temporary', f'Non-temporary {kind}'
            assert labels.get('com.docker.compose.project') == state['project'], f'Project mismatch on {kind}'

def cleanup(state):
    assert os.environ.get('AGENT_RESOURCE_OWNER') == state['owner'], 'Cleanup requires the original resource owner'
    root = Path(state['root']).resolve()
    assert root.is_relative_to(STATE_ROOT.resolve()) and root.name == state['project']
    assert (root / '.owner').read_text().strip() == state['owner']
    if state.get('cleanupComplete'):
        for ls_args in [['ps', '-aq'], ['volume', 'ls', '-q'], ['network', 'ls', '-q']]:
            assert not command(['docker', *ls_args, '--filter', 'label=com.docker.compose.project=' + state['project']]).stdout.strip(), 'A retired project unexpectedly has resources'
        return
    for kind, ls_args in [('container', ['ps', '-aq']), ('volume', ['volume', 'ls', '-q']), ('network', ['network', 'ls', '-q'])]:
        names = command(['docker', *ls_args, '--filter', 'label=com.docker.compose.project=' + state['project']]).stdout.split()
        owned(state, kind, names)
    compose(state, 'down', '--volumes', '--remove-orphans', '--timeout', '20')
    remaining = {}
    for kind, ls_args in [('containers', ['ps', '-aq']), ('volumes', ['volume', 'ls', '-q']), ('networks', ['network', 'ls', '-q'])]:
        remaining[kind] = command(['docker', *ls_args, '--filter', 'label=com.docker.compose.project=' + state['project']]).stdout.split()
    assert not any(remaining.values()), 'Owned test resources remain; inspect the manifest'
    for image in state.get('pulledImages', []):
        if not command(['docker', 'ps', '-aq', '--filter', 'ancestor=' + image]).stdout.strip():
            command(['docker', 'image', 'rm', image], check=False)
    for name in ['backend.env', 'test-env.json']:
        (root / name).unlink(missing_ok=True)
    state['cleanupComplete'] = True
    state['remaining'] = remaining
    write_state(state)

def sql(state, text, user='postgres'):
    return compose(state, 'exec', '-T', 'db', 'psql', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', data=text).stdout

def wait_http(url, attempts=90):
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                if response.status == 200: return
        except Exception:
            if attempt == attempts - 1: raise
        time.sleep(1)

def assert_browser_cors(base, origin):
    requested_headers = 'authorization,apikey,content-type,x-client-info,x-supabase-api-version'
    for path in ['/auth/v1/token?grant_type=password', '/rest/v1/jobs']:
        request = urllib.request.Request(base + path, method='OPTIONS', headers={
            'Origin': origin, 'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': requested_headers,
        })
        with urllib.request.urlopen(request, timeout=5) as response:
            assert response.status == 204, 'Browser API preflight failed'
            assert response.headers.get_all('Access-Control-Allow-Origin') == [origin], 'Browser API CORS origin missing or duplicated'
            assert 'POST' in response.headers.get('Access-Control-Allow-Methods', '').split(', '), 'Browser API CORS method missing'
            allowed = {value.strip().lower() for value in response.headers.get('Access-Control-Allow-Headers', '').split(',')}
            assert set(requested_headers.split(',')).issubset(allowed), 'Browser API CORS headers missing'
    request = urllib.request.Request(base + '/auth/v1/health', headers={'Origin': origin})
    with urllib.request.urlopen(request, timeout=5) as response:
        assert response.headers.get_all('Access-Control-Allow-Origin') == [origin], 'Browser API response CORS missing or duplicated'
    request = urllib.request.Request(base + '/auth/v1/health', method='OPTIONS', headers={'Origin': 'https://example.invalid', 'Access-Control-Request-Method': 'GET'})
    with urllib.request.urlopen(request, timeout=5) as response:
        assert response.headers.get('Access-Control-Allow-Origin') is None, 'Disposable API must not allow non-loopback origins'

def corpus_search_seed(project, reference=None):
    reference = time.time() if reference is None else reference
    fresh = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(reference - 60))
    old = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(reference - 90 * 86400))
    # Keep existing GIS/IT feature fixtures newer than this filler. The separate
    # QGIS role is deliberately outside the normal latest-1000 client snapshot.
    rows = [{
        'external_id': f'{project}-corpus-unrelated-{index:04d}',
        'title': f'CI retail stock assistant {index:04d}', 'company': 'Afavers CI corpus fixture',
        'location': 'Berlin', 'description': 'Kasse und Warenverraeumung. Synthetische Testanzeige.',
        'description_quality': 'summary', 'url': f'https://example.invalid/ci/corpus/{index}',
        'source': 'bundesagentur', 'language': 'de', 'is_manual': False, 'is_active': True,
        'created_at': fresh, 'posted_date': fresh[:10], 'last_seen_at': fresh,
    } for index in range(1100)]
    rows.append({
        'external_id': project + '-deep-corpus-qgis', 'title': 'CI Deep-corpus QGIS Specialist',
        'company': 'Afavers CI corpus fixture', 'location': 'Koeln',
        'description': 'Develop and maintain QGIS maps, ArcGIS workflows and spatial-data pipelines. The role requires geoinformation database experience, coordinate-reference systems and clear technical documentation. Working language is English. This is a synthetic CI listing for corpus-search acceptance.',
        'description_quality': 'full', 'url': 'https://example.invalid/ci/deep-corpus-qgis',
        'source': 'bundesagentur', 'language': 'en', 'is_manual': False, 'is_active': True,
        'created_at': old, 'posted_date': old[:10], 'last_seen_at': fresh,
    })
    return rows

def run():
    owner = os.environ.get('AGENT_RESOURCE_OWNER')
    if not owner:
        if os.environ.get('GITHUB_ACTIONS') != 'true': raise RuntimeError('AGENT_RESOURCE_OWNER is required; use the resource runner locally')
        owner = 'github-' + os.environ['GITHUB_RUN_ID'] + '-' + os.environ.get('GITHUB_RUN_ATTEMPT', '1')
    STATE_ROOT.mkdir(exist_ok=True)
    pointer = STATE_ROOT / 'active.json'
    if pointer.exists():
        previous = json.loads(Path(json.loads(pointer.read_text())['state']).read_text())
        if not previous.get('cleanupComplete'): raise RuntimeError('An unresolved test environment exists; clean its exact state manifest first')
    project = 'afavers-ci-' + hashlib.sha256((owner + secrets.token_hex(8)).encode()).hexdigest()[:14]
    root = STATE_ROOT / project
    ports = {name: int(os.environ.get(name, default)) for name, default in [('AFAVERS_CI_API_PORT', '18080'), ('AFAVERS_CI_APP_PORT', '4173'), ('AFAVERS_CI_MAIL_PORT', '18025')]}
    for port in ports.values():
        with socket.socket() as probe: probe.bind(('127.0.0.1', port))
    root.mkdir(mode=0o700)
    (root / '.owner').write_text(owner)
    secret = secrets.token_hex(32)
    def jwt(role):
        def b64(value): return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=')
        unsigned = b64({'alg':'HS256','typ':'JWT'}) + b'.' + b64({'iss':'afavers-ci','role':role,'iat':int(time.time()),'exp':int(time.time())+7200})
        return (unsigned + b'.' + base64.urlsafe_b64encode(hmac.new(secret.encode(), unsigned, hashlib.sha256).digest()).rstrip(b'=')).decode()
    values = {**ports, 'AFAVERS_REPO':REPO.as_posix(), 'AGENT_RESOURCE_OWNER':owner, 'POSTGRES_PASSWORD':secrets.token_hex(24), 'JWT_SECRET':secret, 'ANON_KEY':jwt('anon'), 'SERVICE_ROLE_KEY':jwt('service_role'), 'CRON_SECRET':secrets.token_hex(32)}
    env_path = root / 'backend.env'
    env_path.write_text(''.join(f'{key}={value}\n' for key, value in values.items()))
    env_path.chmod(0o600)
    state = {'owner':owner,'project':project,'root':str(root.resolve()),'createdAt':int(time.time()),'cleanupComplete':False,'pulledImages':[],'migrationHashes':{}}
    write_state(state)
    reports = REPO / 'reports/e2e'
    reports.mkdir(parents=True,exist_ok=True)
    try:
        # Pull intentionally; compose up itself is forbidden from implicit pulls.
        for image in IMAGES:
            if command(['docker','image','inspect',image],check=False).returncode:
                command(['docker','pull',image]);state['pulledImages'].append(image);write_state(state)
        compose(state, 'up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '180')
        sql(state, (REPO/'deploy/bootstrap/auth-claims.sql').read_text(), 'supabase_admin')
        for migration in sorted((REPO/'supabase/migrations').glob('*.sql')):
            source = migration.read_text().replace('https://YOUR-PROJECT-REF.supabase.co', 'http://gateway:8080/backend').replace('YOUR_CRON_SECRET', values['CRON_SECRET'])
            sql(state, 'BEGIN;\n'+source+'\nCOMMIT;')
            state['migrationHashes'][migration.name] = hashlib.sha256(migration.read_bytes()).hexdigest()
            write_state(state)
        sql(state, "SELECT cron.alter_job(jobid, active := false) FROM cron.job; NOTIFY pgrst, 'reload schema';")
        base = f"http://127.0.0.1:{ports['AFAVERS_CI_API_PORT']}/backend"
        wait_http(base + '/auth/v1/health')
        test_env = {'apiUrl':base,'anonKey':values['ANON_KEY'],'serviceKey':values['SERVICE_ROLE_KEY'],'owner':owner,'mailUrl':f"http://127.0.0.1:{ports['AFAVERS_CI_MAIL_PORT']}",'appUrl':f"http://127.0.0.1:{ports['AFAVERS_CI_APP_PORT']}"}
        assert_browser_cors(base, test_env['appUrl'])
        (root/'test-env.json').write_text(json.dumps(test_env));(root/'test-env.json').chmod(0o600)
        now = time.strftime('%Y-%m-%d',time.gmtime())
        rows = [
            {'external_id':project+'-gis','title':'CI GIS Analyst','company':'Afavers CI Studio','location':'Köln','description':'Maintain spatial datasets and map applications using QGIS and ArcGIS. The data analyst role requires geospatial database experience and the ability to explain analysis to project teams. Our working language is English. These are synthetic CI requirements, not an assessment of any person.','description_quality':'full','url':'https://example.invalid/ci/gis','source':'bundesagentur','posted_date':now,'language':'en'},
            {'external_id':project+'-it','title':'CI IT Consultant','company':'Afavers CI Studio','location':'Düsseldorf','description':'Deliver information technology and software consulting for customer projects. Requirements include maintaining application services, documenting changes, reviewing technical designs and communicating with engineers and clients. Our working language is English. These are synthetic CI requirements.','description_quality':'full','url':'https://example.invalid/ci/it','source':'bundesagentur','posted_date':now,'language':'en'},
            {'external_id':project+'-unrelated','title':'Psychologischen Studienberatung','company':'Afavers CI Studio','location':'Berlin','description':'Psychologische Einzelberatung und Studienberatung an einer Hochschule. Voraussetzungen sind ein abgeschlossenes Psychologiestudium sowie eine psychotherapeutische Weiterbildung. Die Aufgaben umfassen Beratungsgespräche, die Organisation von Gruppenangeboten und die Zusammenarbeit mit dem Hochschulteam. Sehr gute Deutschkenntnisse sind erforderlich.','description_quality':'full','url':'https://example.invalid/ci/psychology','source':'bundesagentur','posted_date':now,'language':'de'},
        ]
        rows.extend(corpus_search_seed(project))
        headers = {'apikey':values['ANON_KEY'],'Authorization':'Bearer '+values['SERVICE_ROLE_KEY'],'Content-Type':'application/json'}
        request = urllib.request.Request(base+'/rest/v1/jobs',data=json.dumps(rows).encode(),headers=headers,method='POST')
        for attempt in range(15):
            try:
                with urllib.request.urlopen(request,timeout=10): break
            except urllib.error.HTTPError as error:
                if attempt==14: raise
                time.sleep(1)
        env = {**os.environ,'AGENT_RESOURCE_OWNER':owner,'AFAVERS_E2E_ENV':str(root/'test-env.json'),'AFAVERS_CI_APP_PORT':str(ports['AFAVERS_CI_APP_PORT']),'VITE_SUPABASE_URL':base,'VITE_SUPABASE_ANON_KEY':values['ANON_KEY'],'VITE_APP_VERSION':os.environ.get('GITHUB_SHA','ci-'+project[-8:])[:12],'NODE_OPTIONS':'--max-old-space-size=768'}
        npm = 'npm.cmd' if os.name == 'nt' else 'npm'
        for step, arguments in [('extension-install', [npm, 'ci']), ('extension-build', [npm, 'run', 'build'])]:
            result = command(arguments, env=env, check=False, cwd=REPO/'extension')
            (reports/(step+'.log')).write_text(result.stdout+result.stderr)
            if result.returncode: raise RuntimeError(step + ' failed; see reports/e2e/' + step + '.log')
        build = command([npm,'run','build'],env=env,check=False)
        (reports/'production-build.log').write_text(build.stdout+build.stderr)
        if build.returncode: raise RuntimeError('Production build failed; see reports/e2e/production-build.log')
        tests = command([npm,'run','test:e2e','--workspace=client'],env=env,check=False)
        print(tests.stdout, end='')
        print(tests.stderr, end='',file=sys.stderr)
        state['testsExitCode'] = tests.returncode
        if tests.returncode: raise RuntimeError('Browser regressions failed')
    finally:
        try:
            logs = compose(state,'logs','--no-color','--tail','80',check=False)
            text = logs.stdout+logs.stderr
            for value in values.values():
                if isinstance(value,str) and len(value)>15: text=text.replace(value,'[redacted]')
            (reports/'backend.log').write_text(text)
        finally:
            cleanup(state)
            (reports/'resource-receipt.json').write_text(json.dumps(state,indent=2))

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['run','cleanup'])
    parser.add_argument('--state',type=Path)
    args=parser.parse_args()
    if args.action=='run': run()
    else:
        path=args.state or Path(json.loads((STATE_ROOT/'active.json').read_text())['state'])
        cleanup(json.loads(path.read_text()))
