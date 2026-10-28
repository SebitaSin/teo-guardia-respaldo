. (Join-Path (Split-Path -Parent $PSScriptRoot) 'installer\scripts\common.ps1')
$root=Split-Path -Parent $PSScriptRoot
$stateFile=Join-Path $root 'var\enlace-personal-session.json'
$state=Get-Content -Raw -LiteralPath $stateFile|ConvertFrom-Json
if($state.continuous){throw 'El enlace ya tiene supervision continua. No se modifica.'}
$oldWorkerId=[int]$state.workerPid
$linkId=[int]$state.linkPid
$worker=Get-CimInstance Win32_Process -Filter ('ProcessId='+$oldWorkerId)
$link=Get-CimInstance Win32_Process -Filter ('ProcessId='+$linkId)
$expectedWorker=Join-Path $PSScriptRoot 'iniciar-enlace-personal.ps1'
$expectedLink=Join-Path $PSScriptRoot 'enlace-personal.mjs'
if($worker.Name -ne 'powershell.exe' -or -not $worker.CommandLine.Contains($expectedWorker) -or $worker.CommandLine -notmatch '\s-Worker\s'){throw 'El supervisor anterior no coincide. No se detuvo nada.'}
if($link.Name -ne 'node.exe' -or -not $link.CommandLine.Contains($expectedLink)){throw 'El proceso del enlace no coincide.'}
$tunnel=@(Get-CimInstance Win32_Process -Filter ('ParentProcessId='+$linkId)|Where-Object{$_.Name -eq 'cloudflared.exe' -and $_.CommandLine -match 'http://127\.0\.0\.1:8790'})
if($tunnel.Count -ne 1){throw 'No se identifico un tunel unico.'}
$tunnelId=[int]$tunnel[0].ProcessId
$before=@{link=$link.CreationDate;tunnel=$tunnel[0].CreationDate;worker=$worker.CreationDate}
$backup=Join-Path $root ('_backups\2026-10-26-corregir-instalador-ventanas\enlace-antes-'+(Get-Date -Format 'HHmmss')+'.json')
Copy-Item -LiteralPath $stateFile -Destination $backup
$argsText='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'supervisar-enlace-existente.ps1')+'" -LinkPid '+$linkId+' -TunnelPid '+$tunnelId+' -Url "'+$state.url+'"'
$p=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList $argsText -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root 'var\enlace-continuo.log') -RedirectStandardError (Join-Path $root 'var\enlace-continuo-error.log')
$readyFile=Join-Path $root 'var\enlace-supervisor-ready.json'
$ready=$false
for($n=0;$n -lt 30;$n++){
  Start-Sleep -Milliseconds 250
  if(Test-Path -LiteralPath $readyFile){$s=Get-Content -Raw -LiteralPath $readyFile|ConvertFrom-Json;if($s.workerPid -eq $p.Id -and $s.linkPid -eq $linkId -and $s.tunnelPid -eq $tunnelId){$ready=$true;break}}
  $p.Refresh();if($p.HasExited){throw 'El nuevo supervisor no inicio. El anterior no se detuvo.'}
}
if(-not $ready){throw 'El nuevo supervisor no confirmo. No se detuvo el anterior.'}
$stillWorker=Get-CimInstance Win32_Process -Filter ('ProcessId='+$oldWorkerId)
if($stillWorker.CreationDate -ne $before.worker -or $stillWorker.CommandLine -ne $worker.CommandLine){throw 'Cambio la identidad del supervisor. No se detuvo.'}
# Terminate only the verified old timer. The isolated regression proves that
# Windows keeps the child alive and does not execute its finally cleanup.
Stop-Process -Id $oldWorkerId -Force
Start-Sleep 2
$afterLink=Get-CimInstance Win32_Process -Filter ('ProcessId='+$linkId)
$afterTunnel=Get-CimInstance Win32_Process -Filter ('ProcessId='+$tunnelId)
if($afterLink.CreationDate -ne $before.link -or $afterTunnel.CreationDate -ne $before.tunnel){throw 'La identidad del enlace/tunel cambio; comprobar antes de comunicar.'}
$result=@{sameUrl=$state.url;linkPid=$linkId;tunnelPid=$tunnelId;guardianPid=$p.Id;originalProcessesPreserved=$true;scheduledCutoffRemoved=$true}
$result|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $root '_backups\2026-10-26-corregir-instalador-ventanas\enlace-continuo-verificado.json') -Encoding UTF8
$result|ConvertTo-Json -Compress
