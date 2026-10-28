param([Parameter(Mandatory=$true)][int]$LinkPid,[Parameter(Mandatory=$true)][int]$TunnelPid,[Parameter(Mandatory=$true)][string]$Url)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$statePath=Join-Path $root 'var\enlace-personal-session.json'
$readyPath=Join-Path $root 'var\enlace-supervisor-ready.json'
$expected=Join-Path $PSScriptRoot 'enlace-personal.mjs'
if($Url -notmatch '^https://[a-z0-9-]+\.trycloudflare\.com/mis-datos$'){throw 'Direccion de enlace no valida'}
$nodeInfo=Get-CimInstance Win32_Process -Filter ('ProcessId='+$LinkPid)
$tunnelInfo=Get-CimInstance Win32_Process -Filter ('ProcessId='+$TunnelPid)
if($nodeInfo.Name -ne 'node.exe' -or -not $nodeInfo.CommandLine.Contains($expected)){throw 'El proceso del enlace no coincide'}
if($tunnelInfo.Name -ne 'cloudflared.exe' -or $tunnelInfo.ParentProcessId -ne $LinkPid -or $tunnelInfo.CommandLine -notmatch 'http://127\.0\.0\.1:8790'){throw 'El tunel no coincide'}
$mutex=[Threading.Mutex]::new($false,'Local\GuardiaSchestakow-EnlaceExistente')
if(-not $mutex.WaitOne(0)){$mutex.Dispose();exit 0}
try {
  $node=Get-Process -Id $LinkPid -ErrorAction Stop
  $tunnel=Get-Process -Id $TunnelPid -ErrorAction Stop
  $state=@{status='running';url=$Url;linkPid=$LinkPid;tunnelPid=$TunnelPid;workerPid=$PID;continuous=$true;expiresAt=$null;since=[DateTimeOffset]::UtcNow.ToString('o')}
  [IO.File]::WriteAllText($statePath,($state|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText($readyPath,(@{workerPid=$PID;linkPid=$LinkPid;tunnelPid=$TunnelPid}|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
  while($true){
    Start-Sleep 15
    $node.Refresh();$tunnel.Refresh()
    if($node.HasExited -or $tunnel.HasExited){$state.status='interrupted';$state.error='El proceso se interrumpio. No se abre otro enlace automaticamente.';break}
  }
  [IO.File]::WriteAllText($statePath,($state|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
}finally{
  # Never stop or restart node/cloudflared: preserve the exact existing URL.
  $mutex.ReleaseMutex();$mutex.Dispose()
}
