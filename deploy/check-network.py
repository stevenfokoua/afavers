import subprocess

for command in [
 ['docker','network','inspect','afavers_default','--format','{{.Id}} {{json .IPAM.Config}}'],
 ['docker','exec','afavers-functions-1','cat','/etc/hosts'],
 ['docker','exec','afavers-functions-1','bash','-c',"timeout 3 bash -c '</dev/tcp/host.docker.internal/18980'"],
 ['docker','exec','afavers-functions-1','bash','-c',"timeout 3 bash -c '</dev/tcp/host.docker.internal/25'"],
]:
 run=subprocess.run(command,capture_output=True,text=True)
 print('Command',command[1:3],'exit',run.returncode)
 print((run.stdout+run.stderr)[-1800:])
