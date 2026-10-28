# Real install/import file operations in a private temporary destination.
# Does not run MSI packages, write actual Desktop shortcuts or register tasks.
. (Join-Path $PSScriptRoot 'common.ps1')
$project=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$kit=Join-Path $project 'outputs\Guardia-Instalador'
$testRoot=Join-Path $project ('_backups\2026-10-26-corregir-instalador-ventanas\flujo con espacios '+[Guid]::NewGuid().ToString('N'))
$homePath=Join-Path $testRoot 'destino'
$utf8=[Text.UTF8Encoding]::new($false)
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'wizard.ps1'),[ref]$tokens,[ref]$errors)
if($errors){throw 'Error de sintaxis en el asistente'}
foreach($fn in $ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$false)) {
  Set-Item -Path ('Function:\'+$fn.Name) -Value $fn.Body.GetScriptBlock()
}
$script:shortcuts=@()
function Invoke-SignedInstaller([string]$File,[string]$Arguments,[string]$Publisher) {
  $sig=Get-AuthenticodeSignature -LiteralPath $File
  if($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch $Publisher){throw 'Firma incorrecta'}
  # Signature is real; running MSI/VC++ is deliberately outside this test.
}
function New-Object([string]$ComObject) {
  if($ComObject -ne 'WScript.Shell'){throw 'Objeto inesperado'}
  $shell=[pscustomobject]@{}
  $shell | Add-Member ScriptMethod CreateShortcut {
    param($path)
    $s=[pscustomobject]@{Path=$path;TargetPath='';Arguments='';WorkingDirectory='';IconLocation=''}
    $s | Add-Member ScriptMethod Save {$script:shortcuts+= $this}
    return $s
  }
  return $shell
}
Install-Guardia
if(-not (Test-Path -LiteralPath (Join-Path $homePath 'instalado.json')) -or $script:shortcuts.Count -ne 3){throw 'No se completo la instalacion aislada'}
foreach($s in $script:shortcuts){if($s.IconLocation -notmatch 'guardia-hospital\.ico'){throw 'Falta icono'}}
$source=Join-Path $testRoot 'origen'
New-Item -ItemType Directory -Force -Path "$source\server","$source\src\data","$source\var\mail" | Out-Null
[IO.File]::WriteAllText("$source\server\users.local.json",'[]')
foreach($name in @('staff','catalog','internacion')){[IO.File]::WriteAllText("$source\src\data\$name.json",'{}')}
[IO.File]::WriteAllText("$source\var\valor.json",'{"prueba":1}')
$script:archiveToRead=Join-Path $testRoot 'preparacion.guardia'
$secrets=@{APP_SESSION_SECRET=('s'*48)}
$node=Join-Path $kit 'runtime\node\node.exe'
[void](Invoke-Archive $node 'pack' @{root=$source;output=$script:archiveToRead;password='frase-interna-de-prueba-2026';secrets=$secrets;kind='preparation'})
function Read-Host([string]$Prompt){return $script:archiveToRead}
function Read-TextSecret([string]$Prompt){return 'frase-interna-de-prueba-2026'}
Import-Guardia
if((Load-Secrets (Join-Path $homePath 'secrets.dpapi')).APP_SESSION_SECRET -cne $secrets.APP_SESSION_SECRET){throw 'No coincide la clave importada'}
$blocked=$false
try{Activate-Guardia}catch{if($_.Exception.Message -match 'preparacion'){$blocked=$true}else{throw}}
if(-not $blocked){throw 'Se permitio activar una preparacion'}
$script:archiveToRead=Join-Path $testRoot 'final.guardia'
[IO.File]::WriteAllText("$source\var\valor.json",'{"prueba":2}')
[void](Invoke-Archive $node 'pack' @{root=$source;output=$script:archiveToRead;password='frase-interna-de-prueba-2026';secrets=$secrets;kind='final'})
Import-Guardia
$value=Get-Content -Raw -LiteralPath (Join-Path $homePath 'app\var\valor.json') | ConvertFrom-Json
if($value.prueba -ne 2){throw 'No se sustituyeron los datos de preparacion por los finales'}
if(-not (Get-ChildItem -LiteralPath $homePath -Directory -Filter 'datos-preparacion-anterior-*')){throw 'No se preservo la copia anterior'}
Write-Host 'FLUJO AISLADO OK: archivos y runtimes instalados, 3 accesos con icono, importacion/DPAPI, preparacion bloqueada y reemplazo por final con respaldo.'
Write-Host 'No se ejecutaron instaladores MSI, no se escribio en Escritorio, no se iniciaron tareas ni servidor.'
# Exercise the actual one-entry orchestration with completed substeps stubbed.
$homePath=Join-Path $testRoot 'entrada-unica'
New-Item -ItemType Directory -Force -Path $homePath | Out-Null
$kit=Join-Path $testRoot 'kit-entrada'
[IO.File]::WriteAllText((Join-Path $testRoot 'DATOS-Y-CLAVES.guardia'),'archivo de prueba del orquestador')
$script:sequence=@()
function Install-Guardia {$script:sequence+='instalar';[IO.File]::WriteAllText((Join-Path $homePath 'instalado.json'),'{}')}
function Import-Guardia([string]$File='') {if($File -ne (Join-Path $testRoot 'DATOS-Y-CLAVES.guardia')){throw 'No encuentra automaticamente la copia hermana'};$script:sequence+='importar';[IO.File]::WriteAllText((Join-Path $homePath 'importado.json'),'{}')}
function Setup-Remote([switch]$DeferBrowser) {$script:sequence+='remoto'}
function Open-RemotePage {$script:sequence+='registro'}
Prepare-Guardia
if(($script:sequence -join ',') -ne 'remoto,instalar,importar,registro'){throw 'Orden de preparacion incorrecto'}
$script:sequence=@();Prepare-Guardia
if(($script:sequence -join ',') -ne 'remoto,registro'){throw 'El reintento repite instalacion o importacion ya terminadas'}
Write-Host 'Entrada unica OK: remoto primero, instala/importa y ofrece registro; reintento no repite pasos terminados.'
