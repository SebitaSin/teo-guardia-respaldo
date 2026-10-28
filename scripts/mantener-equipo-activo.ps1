param([Parameter(Mandatory=$true)][int]$LinkPid)
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'installer\scripts\common.ps1')
$root=Split-Path -Parent $PSScriptRoot
$info=Get-CimInstance Win32_Process -Filter ('ProcessId='+$LinkPid)
if($info.Name -ne 'node.exe' -or -not $info.CommandLine.Contains((Join-Path $PSScriptRoot 'enlace-personal.mjs'))){throw 'No coincide el proceso del enlace'}
$mutex=[Threading.Mutex]::new($false,'Local\GuardiaSchestakow-EvitarSuspension')
if(-not $mutex.WaitOne(0)){$mutex.Dispose();exit 0}
Add-Type 'using System.Runtime.InteropServices; public static class GuardiaEnlacePower { [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags); }'
$report=Join-Path $root 'var\enlace-equipo-activo.json'
try{
  if([GuardiaEnlacePower]::SetThreadExecutionState([uint32]2147483649) -eq 0){throw 'Windows no acepto prevenir suspension automatica'}
  @{active=$true;workerPid=$PID;linkPid=$LinkPid;scope='mientras el enlace siga activo';powerPlanChanged=$false}|ConvertTo-Json|Set-Content -LiteralPath $report -Encoding UTF8
  $link=Get-Process -Id $LinkPid
  while(-not $link.HasExited){Start-Sleep 30;$link.Refresh()}
}finally{
  [void][GuardiaEnlacePower]::SetThreadExecutionState([uint32]2147483648)
  @{active=$false;workerPid=$PID;linkPid=$LinkPid;powerPlanChanged=$false}|ConvertTo-Json|Set-Content -LiteralPath $report -Encoding UTF8
  $mutex.ReleaseMutex();$mutex.Dispose()
}
