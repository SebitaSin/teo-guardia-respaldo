. (Join-Path $PSScriptRoot 'scripts\common.ps1')
$base = Join-Path (Split-Path -Parent $PSScriptRoot) ('_backups\2026-10-26-instalador\pipe-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path "$base\source\server","$base\source\var","$base\source\src\data" | Out-Null
[IO.File]::WriteAllText("$base\source\server\users.local.json",'[]')
[IO.File]::WriteAllText("$base\source\var\prueba.txt",'prueba interna')
$node = Join-Path (Split-Path -Parent $PSScriptRoot) 'outputs\Guardia-Instalador\runtime\node\node.exe'
$r=Invoke-Archive $node 'pack' @{root="$base\source";output="$base\copia.guardia";password='frase-interna-2026-para-prueba';secrets=@{APP_SESSION_SECRET=('x'*48)};kind='final'}
$r2=Invoke-Archive $node 'unpack' @{input="$base\copia.guardia";target="$base\destino";password='frase-interna-2026-para-prueba'}
if($r.count -ne $r2.count -or $r2.kind -ne 'final'){throw 'Fallo la tuberia'}
Write-Host 'Exportacion e importacion desde Windows PowerShell: OK'
