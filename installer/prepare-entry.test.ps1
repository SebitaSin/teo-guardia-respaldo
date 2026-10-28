. (Join-Path $PSScriptRoot 'scripts\common.ps1')
$project=Split-Path -Parent $PSScriptRoot
$tmp=Join-Path $project ('_backups\2026-10-26-corregir-instalador-ventanas\preparar-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$kit=Join-Path $tmp 'kit';$homePath=Join-Path $tmp 'destino';New-Item -ItemType Directory -Path $homePath|Out-Null
[IO.File]::WriteAllText((Join-Path $tmp 'DATOS-Y-CLAVES.guardia'),'solo prueba')
$t=$null;$e=$null;$a=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'scripts\wizard.ps1'),[ref]$t,[ref]$e)
$f=$a.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Prepare-Guardia'},$false)
Set-Item Function:\Prepare-Guardia $f.Body.GetScriptBlock()
$script:steps=@();$script:failImport=$false
function Setup-Remote([switch]$DeferBrowser){if(-not $DeferBrowser){throw 'Abre navegador demasiado pronto'};$script:steps+='remoto'}
function Open-RemotePage {$script:steps+='registro'}
function Install-Guardia {$script:steps+='instalar';[IO.File]::WriteAllText((Join-Path $homePath 'instalado.json'),'{}')}
function Import-Guardia([string]$File){$script:steps+='importar';if($script:failImport){throw 'Fallo de importacion de prueba'};[IO.File]::WriteAllText((Join-Path $homePath 'importado.json'),'{}')}
Prepare-Guardia
if(($script:steps -join ',') -ne 'remoto,instalar,importar,registro'){throw 'Orden incorrecto'}
$script:steps=@();Prepare-Guardia
if(($script:steps -join ',') -ne 'remoto,registro'){throw 'Repite pasos ya completados'}
$homePath=Join-Path $tmp 'fallo';New-Item -ItemType Directory -Path $homePath|Out-Null
$script:steps=@();$script:failImport=$true
try{Prepare-Guardia;throw 'No propaga fallo'}catch{if($_.Exception.Message -ne 'Fallo de importacion de prueba'){throw}}
if(($script:steps -join ',') -ne 'remoto,instalar,importar,registro'){throw 'No ofrece registro remoto al fallar la app'}
Write-Host 'Acceso unico: remoto primero, importacion automatica, reintento y registro aun tras fallo: OK'
