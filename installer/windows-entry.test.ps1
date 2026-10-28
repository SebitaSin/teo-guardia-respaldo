. (Join-Path $PSScriptRoot 'scripts\common.ps1')
$root=Split-Path -Parent $PSScriptRoot
$fixture=Join-Path $root ('_backups\2026-10-27-corregir-elevacion-administrador\prueba-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $fixture | Out-Null
$wizard=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'scripts\wizard.ps1')
[IO.File]::WriteAllText((Join-Path $fixture 'wizard.ps1'),$wizard)
$capture=Join-Path $fixture 'elevacion.json'
$common=@'
$ErrorActionPreference='Stop'
$script:HomeGuardia=$PSScriptRoot
function Test-Administrator {return $false}
function Start-Process { param($FilePath,$Verb,$ArgumentList,[switch]$Wait,[switch]$PassThru,$ErrorAction); [IO.File]::WriteAllText('__CAPTURE__',(@{FilePath=$FilePath;Verb=$Verb;ArgumentList=$ArgumentList;Wait=[bool]$Wait;PassThru=[bool]$PassThru}|ConvertTo-Json -Compress)); [pscustomobject]@{ExitCode=0} }
'@
[IO.File]::WriteAllText((Join-Path $fixture 'common.ps1'),$common.Replace('__CAPTURE__',$capture.Replace('\','\\').Replace("'","''")))
$ps=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$script=Join-Path $fixture 'wizard.ps1'
$info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$ps
$info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$script+'" -Action Prepare -NoPause'
$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
$p=[Diagnostics.Process]::new();$p.StartInfo=$info;[void]$p.Start();$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync()
if(-not $p.WaitForExit(15000)){$p.Kill();throw 'El asistente no termino tras un unico intento de elevacion'}
$result=Get-Content -Raw -LiteralPath $capture|ConvertFrom-Json
$joined=[string]::Join(' ',$result.ArgumentList)
if($result.Verb -ne 'RunAs' -or -not $result.Wait -or -not $result.PassThru -or $joined -notmatch '-ElevationAttempted' -or $joined -notmatch '".+wizard\.ps1"') {throw 'La elevacion controlada no paso argumentos/ruta correctamente'}
Write-Host 'Sin token admin: un pedido RunAs, espera al resultado, ruta entre comillas y marca anti-bucle OK'

$common2=$common.Replace('__CAPTURE__',$capture.Replace('\','\\').Replace("'","''")).Replace('function Start-Process {','function Start-Process { throw "NO DEBE RELANZAR"; ')
[IO.File]::WriteAllText((Join-Path $fixture 'common.ps1'),$common2)
$info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$script+'" -Action Prepare -NoPause -ElevationAttempted'
$p=[Diagnostics.Process]::new();$p.StartInfo=$info;[void]$p.Start();$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync()
if(-not $p.WaitForExit(15000)){$p.Kill();throw 'El asistente quedo en bucle tras una elevacion fallida'}
$text=$out.Result+$err.Result
if($text -notmatch 'Windows abrio el asistente, pero no concedio' -or $text -match 'NO DEBE RELANZAR'){throw 'No se informo correctamente el rechazo/token insuficiente'}
Write-Host 'Elevacion rechazada o token insuficiente: aviso claro y cero relanzamientos OK'

$throwing=$common.Replace('__CAPTURE__',$capture.Replace('\','\\').Replace("'","''")) -replace 'function Start-Process \{.*\}','function Start-Process { throw "The operation was canceled by the user" }'
[IO.File]::WriteAllText((Join-Path $fixture 'common.ps1'),$throwing)
$info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$script+'" -Action Prepare -NoPause'
$p=[Diagnostics.Process]::new();$p.StartInfo=$info;[void]$p.Start();$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync()
if(-not $p.WaitForExit(15000)){$p.Kill();throw 'El asistente no termino tras cancelar UAC'}
$text=$out.Result+$err.Result
if($text -notmatch 'Se cancelo el permiso de Windows. No se instalo ni modifico nada' -or $text -match 'NO DEBE RELANZAR'){throw 'La cancelacion de UAC no se manejo limpiamente'}
Write-Host 'Cancelacion UAC: un intento, sin instalacion y sin ventanas encadenadas OK'
