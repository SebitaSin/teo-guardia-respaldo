. (Join-Path $PSScriptRoot 'scripts\common.ps1')
$project=Split-Path -Parent $PSScriptRoot
$fixture=Join-Path $project ('_backups\2026-10-26-corregir-instalador-ventanas\supervisor-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $fixture | Out-Null
$node=Join-Path $project 'outputs\Guardia-Instalador\runtime\node\node.exe'
[IO.File]::WriteAllText((Join-Path $fixture 'child.mjs'),'setInterval(()=>{},1000);')
$parent=@'
param($Fixture,$Node)
$p=Start-Process -FilePath $Node -ArgumentList ('"'+(Join-Path $Fixture 'child.mjs')+'"') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Fixture 'child.log') -RedirectStandardError (Join-Path $Fixture 'child-error.log')
[IO.File]::WriteAllText((Join-Path $Fixture 'pid.txt'),[string]$p.Id)
try{while($true){Start-Sleep 1}}finally{[IO.File]::WriteAllText((Join-Path $Fixture 'finally.txt'),'ejecutado');Stop-Process -Id $p.Id -ErrorAction SilentlyContinue}
'@
[IO.File]::WriteAllText((Join-Path $fixture 'parent.ps1'),$parent)
$argsText='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $fixture 'parent.ps1')+'" -Fixture "'+$fixture+'" -Node "'+$node+'"'
$p=Start-Process (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList $argsText -WindowStyle Hidden -PassThru
$childPid=$null
try{
  for($n=0;$n -lt 20;$n++){if(Test-Path -LiteralPath (Join-Path $fixture 'pid.txt')){break};Start-Sleep -Milliseconds 250}
  $childPid=[int](Get-Content -Raw -LiteralPath (Join-Path $fixture 'pid.txt'))
  $child=Get-CimInstance Win32_Process -Filter ('ProcessId='+$childPid)
  if(-not $child.CommandLine.Contains((Join-Path $fixture 'child.mjs'))){throw 'No coincide el hijo de prueba'}
  Stop-Process -Id $p.Id -Force
  Start-Sleep 1
  if(-not (Get-Process -Id $childPid -ErrorAction SilentlyContinue)){throw 'El hijo no sobrevivio al supervisor'}
  if(Test-Path -LiteralPath (Join-Path $fixture 'finally.txt')){throw 'Se ejecuto cleanup al terminar el supervisor'}
  Write-Host 'Reemplazo de supervisor: hijo activo y sin cleanup; prueba aislada OK.'
}finally{
  if(Get-Process -Id $p.Id -ErrorAction SilentlyContinue){Stop-Process -Id $p.Id -Force}
  if($childPid -and (Get-Process -Id $childPid -ErrorAction SilentlyContinue)){Stop-Process -Id $childPid -Force}
}
