param([Parameter(Mandatory=$true)][string]$Source,[Parameter(Mandatory=$true)][string]$Destination)
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'credentials.ps1')
$Source=(Resolve-Path -LiteralPath $Source).Path
$Destination=[IO.Path]::GetFullPath($Destination)
if($env:OneDrive -and $Destination.StartsWith($env:OneDrive,[StringComparison]::OrdinalIgnoreCase)){throw 'La carpeta privada debe quedar fuera de OneDrive.'}
if(Test-Path -LiteralPath (Join-Path $Destination 'COMPROBACION.json')){throw 'La copia ya fue verificada. No se reemplaza.'}
Protect-Folder $Destination
$kit=Join-Path $Source 'outputs\Guardia-Instalador'
Assert-Kit $kit
Copy-Item -LiteralPath $kit -Destination $Destination -Recurse -Force
# The user enters a passphrase locally. It is never saved with the archive.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form=[Windows.Forms.Form]::new();$form.Text='Hospital Schestakow - Proteger la copia';$form.Size=[Drawing.Size]::new(550,310);$form.StartPosition='CenterScreen';$form.TopMost=$true
$label=[Windows.Forms.Label]::new();$label.Text="Elegi una frase de al menos 16 caracteres y repetila.`nLa vas a necesitar en la otra PC. No queda guardada en la carpeta.`nEsto NO detiene la app ni el enlace del personal.";$label.Location=[Drawing.Point]::new(20,15);$label.Size=[Drawing.Size]::new(505,70);$form.Controls.Add($label)
$first=[Windows.Forms.TextBox]::new();$first.Location=[Drawing.Point]::new(20,100);$first.Width=490;$first.UseSystemPasswordChar=$true;$form.Controls.Add($first)
$second=[Windows.Forms.TextBox]::new();$second.Location=[Drawing.Point]::new(20,145);$second.Width=490;$second.UseSystemPasswordChar=$true;$form.Controls.Add($second)
$button=[Windows.Forms.Button]::new();$button.Text='Crear copia';$button.Location=[Drawing.Point]::new(350,200);$button.Size=[Drawing.Size]::new(160,35);$form.Controls.Add($button)
$button.Add_Click({if($first.Text.Length -lt 16 -or $first.Text -cne $second.Text){[void][Windows.Forms.MessageBox]::Show('Las frases deben coincidir y tener al menos 16 caracteres.');return};$form.DialogResult='OK';$form.Close()})
$form.AcceptButton=$button
if($form.ShowDialog() -ne 'OK'){$form.Dispose();throw 'Copia cancelada. La app y el enlace siguen activos.'}
$password=$first.Text;$first.Clear();$second.Clear();$form.Dispose()
$secrets=Get-MigrationSecrets $Source
$stage=Join-Path $Source ('_backups\2026-10-26-copia-preparacion\snapshot-'+[Guid]::NewGuid().ToString('N'))
Protect-Folder (Split-Path -Parent $stage)
$python=Join-Path $kit 'runtime\python\python.exe';$node=Join-Path $kit 'runtime\node\node.exe'
$text=& $python (Join-Path $PSScriptRoot 'snapshot.py') $Source $stage
if($LASTEXITCODE -ne 0){throw 'No se pudo obtener una copia consistente. El origen sigue funcionando.'}
$snapshot=$text | ConvertFrom-Json
$archive=Join-Path $Destination 'DATOS-Y-CLAVES.guardia'
if(Test-Path -LiteralPath ($archive+'.incompleta')) {
  $oldArchive=$archive+'.incompleta'
  $savedArchive=Join-Path $Destination ('intento-anterior-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.guardia.incompleta')
  if((Split-Path -Parent ([IO.Path]::GetFullPath($oldArchive))) -ne $Destination -or (Split-Path -Parent ([IO.Path]::GetFullPath($savedArchive))) -ne $Destination){throw 'Archivo fuera de la carpeta privada'}
  Move-Item -LiteralPath $oldArchive -Destination $savedArchive
}
$result=Invoke-Archive $node 'pack' @{root=$snapshot.root;originalSource=$Source;output=$archive;password=$password;secrets=$secrets;kind='preparation'}
$validation=Join-Path $stage 'validacion'
$restored=Invoke-Archive $node 'unpack' @{input=$archive;target=$validation;password=$password}
foreach($key in $secrets.Keys){if([string]$restored.secrets.$key -cne [string]$secrets[$key]){throw 'No coincide una clave de la copia. No se marco lista.'}}
Get-ChildItem -LiteralPath (Join-Path $Source 'server') -Filter *.mjs | Where-Object {$_.Name -notmatch '\.test\.'} | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $validation 'server')}
$proof=Invoke-Archive $node 'verify' @{root=$validation;secrets=$secrets}
$report=@{createdAt=$snapshot.createdAt;files=$result.count;encryptedFiles=$proof.encryptedFiles;responses=$proof.responses;kind='preparation';sourceStillActive=$true;archiveSHA256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash}
$report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Destination 'COMPROBACION.json') -Encoding UTF8
@'
CARPETA COMPLETA PARA EL PENDRIVE - COPIA DE PREPARACION

1. Copiar TODA esta carpeta al pendrive, no solamente su acceso directo.
2. En la otra PC: Guardia-Instalador > EMPEZAR.cmd > Revisar e Instalar.
3. Importar DATOS-Y-CLAVES.guardia con la frase elegida en la PC original.
4. CONFIGURAR-CONTROL-REMOTO.cmd instala el acceso remoto. En la pagina
   de Google hay que entrar con tu cuenta, registrar la PC y elegir un PIN.
   Desde casa: https://remotedesktop.google.com/access/ y la misma cuenta.
   Hacer este registro tambien en el origen permite terminar el cambio
   desde casa sin tener que volver fisicamente a buscar archivos.

La copia incluye los datos y las claves configuradas a la hora que figura
en COMPROBACION.json. El origen SIGUE ACTIVO y recibe nuevas respuestas.
No activar esta copia como segundo servidor: primero hay que trasladar
las ultimas respuestas en la copia FINAL. La preparacion permite dejar
instalados todos los componentes, datos y claves sin cortar el enlace.

La frase de descifrado NO se guarda en esta carpeta. Guardarla por separado.
Esta carpeta es privada. No subirla a OneDrive, Drive o GitHub.
'@ | Set-Content -LiteralPath (Join-Path $Destination 'LEER PRIMERO.txt') -Encoding UTF8
$secrets=$null;$password=$null;$restored=$null
Write-Output ($report | ConvertTo-Json -Compress)
Start-Process explorer.exe -ArgumentList ('/select,"'+$Destination+'"')
