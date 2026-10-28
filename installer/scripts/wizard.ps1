param([ValidateSet('Menu','Check','Install','Import','Activate','Remote','Internet','Backup','Update','Prepare')][string]$Action = 'Menu',[switch]$NoPause,[switch]$ElevationAttempted)
. (Join-Path $PSScriptRoot 'common.ps1')
$kit = Split-Path -Parent $PSScriptRoot
$homePath = $script:HomeGuardia
$utf8 = [Text.UTF8Encoding]::new($false)
Write-Host 'Instalador corregido: 27/10/2026 - R6'

function Add-Task([string]$Name, [string]$Script, [switch]$AtLogon) {
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $taskAction = New-ScheduledTaskAction -Execute $ps -Argument ('-NoProfile -ExecutionPolicy Bypass -File "' + $Script + '"') -WorkingDirectory $homePath
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $Name -Action $taskAction -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
}
function Install-Guardia {
  Assert-Computer $homePath
  Assert-Kit $kit
  if (Test-Path -LiteralPath (Join-Path $homePath 'instalado.json')) { throw 'Ya esta instalada. No se sobreescriben los datos. Usar el menu de revision o importacion.' }
  Protect-Folder $homePath
  Invoke-SignedInstaller (Join-Path $kit 'prerequisitos\vc_redist.x64.exe') '/install /quiet /norestart' 'Microsoft'
  foreach ($dir in @('app','runtime','asistente','recursos')) { Copy-Item -LiteralPath (Join-Path $kit $dir) -Destination $homePath -Recurse -Force }
  Copy-Item -LiteralPath (Join-Path $kit 'manifest.json') -Destination $homePath
  & (Join-Path $homePath 'runtime\node\node.exe') --version
  if ($LASTEXITCODE -ne 0) { throw 'Node no pudo arrancar; revisar Windows y Visual C++.' }
  & (Join-Path $homePath 'runtime\python\python.exe') (Join-Path $homePath 'asistente\python-check.py')
  if ($LASTEXITCODE -ne 0) { throw 'Python no pudo cargar las bibliotecas.' }
  # Local shortcuts call the same assistant; no source-PC absolute paths are embedded.
  $shell = New-Object -ComObject WScript.Shell
  foreach ($entry in @(@('HOSPITAL SCHESTAKOW','Open'),@('GUARDIA - Administrar','Menu'),@('GUARDIA - Revisar','Check'))) {
    $shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) ($entry[0] + '.lnk')))
    $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $homePath 'asistente\wizard.ps1') + '" -Action ' + $entry[1]
    if($entry[1] -eq 'Open') {$shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $homePath 'asistente\open.ps1')+'"'}
    $shortcut.IconLocation=(Join-Path $homePath 'recursos\guardia-hospital.ico')+',0'
    $shortcut.WorkingDirectory = $homePath; $shortcut.Save()
  }
  [IO.File]::WriteAllText((Join-Path $homePath 'instalado.json'), (@{date=(Get-Date).ToString('o');status='esperando-mudanza'} | ConvertTo-Json), $utf8)
  Write-Host 'Instalacion preparada. Falta importar la mudanza definitiva. Todavia no envia correos ni publica datos.'
}
function Import-Guardia([string]$File='') {
  if (-not (Test-Path -LiteralPath (Join-Path $homePath 'instalado.json'))) { throw 'Primero elegir Instalar.' }
  if (Test-Path -LiteralPath (Join-Path $homePath 'active.json')) { throw 'La app ya esta activa. No se importan copias encima de datos nuevos.' }
  $refreshPreparation=$false
  if (Test-Path -LiteralPath (Join-Path $homePath 'secrets.dpapi')) {
    $previous=Get-Content -Raw -LiteralPath (Join-Path $homePath 'importado.json') | ConvertFrom-Json
    if($previous.kind -ne 'preparation'){throw 'Ya se importo una mudanza. No se reemplaza automaticamente.'}
    $refreshPreparation=$true
  }
  if(-not $File){$File=(Read-Host 'Arrastra aqui el archivo .guardia y presiona Enter').Trim('"')}
  $password = Read-TextSecret 'Frase con la que protegiste esa mudanza'
  $stage = Join-Path $homePath ('importacion-' + (Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
  $meta = Invoke-Archive (Join-Path $homePath 'runtime\node\node.exe') 'unpack' @{input=$file;target=$stage;password=$password}
  $password = $null
  if($refreshPreparation -and $meta.kind -ne 'final'){throw 'Para completar una preparacion ya importada se requiere la copia FINAL actualizada.'}
  if ($meta.kind -eq 'backup') {
    Write-Host 'RESTAURACION POR AVERIA: la PC anterior no debe seguir activa. Esta copia puede ser anterior a las ultimas respuestas.'
    if ((Read-Host 'Escribe ORIGEN FUERA DE SERVICIO para restaurar este respaldo') -cne 'ORIGEN FUERA DE SERVICIO') { throw 'No se restauro el respaldo.' }
  } elseif ($meta.kind -eq 'preparation') {
    Write-Host 'COPIA DE PREPARACION: datos y claves importados. El origen sigue activo. Se conserva sin habilitar otro remitente de reclamos.'
    Write-Host 'Antes del cambio de servidor se necesita una copia FINAL con las ultimas respuestas.'
  } elseif ($meta.kind -ne 'final') { throw 'Esta copia no es una mudanza final ni un respaldo restaurable.' }
  $app = Join-Path $homePath 'app'
  if($refreshPreparation){
    $oldData=Join-Path $app 'var'
    $savedData=Join-Path $homePath ('datos-preparacion-anterior-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
    $allowed=[IO.Path]::GetFullPath($homePath)+'\'
    if(-not [IO.Path]::GetFullPath($oldData).StartsWith($allowed) -or -not [IO.Path]::GetFullPath($savedData).StartsWith($allowed)){throw 'Ruta de respaldo fuera de la instalacion'}
    if(Test-Path -LiteralPath $oldData){Move-Item -LiteralPath $oldData -Destination $savedData}
  }
  foreach ($dir in @('var','src','server')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $app $dir) | Out-Null
    if (Test-Path -LiteralPath (Join-Path $stage $dir)) { Copy-Item -Path (Join-Path $stage ($dir + '\*')) -Destination (Join-Path $app $dir) -Recurse -Force }
  }
  # Rewrite only local path references in ordinary JSON and SQLite, never encrypted payloads.
  & (Join-Path $homePath 'runtime\python\python.exe') (Join-Path $PSScriptRoot 'relocate.py') $app $meta.source
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron adaptar las rutas. La copia original sigue intacta.' }
  $proof = Invoke-Archive (Join-Path $homePath 'runtime\node\node.exe') 'verify' @{root=$app;secrets=$meta.secrets}
  Write-Host ('Datos cifrados comprobados: ' + $proof.encryptedFiles + '. Fichas del personal guardadas: ' + $proof.responses)
  Save-Secrets $meta.secrets (Join-Path $homePath 'secrets.dpapi')
  . (Join-Path $PSScriptRoot 'credentials.ps1')
  Show-MigrationCredentials $meta.secrets
  $saved=Load-Secrets (Join-Path $homePath 'secrets.dpapi')
  foreach($property in $meta.secrets.PSObject.Properties) {
    if([string]$saved.($property.Name) -cne [string]$property.Value){throw 'No coincide una clave guardada en destino. No se activo la app.'}
  }
  $saved=$null
  [IO.File]::WriteAllText((Join-Path $homePath 'importado.json'), (@{at=(Get-Date).ToString('o');files=$meta.count;kind=$meta.kind} | ConvertTo-Json), $utf8)
  Write-Host ('Mudanza importada: ' + $meta.count + ' archivos. La carpeta importacion conserva una copia privada. Guardar tambien el .guardia fuera de esta PC.')
}
function Activate-Guardia {
  if (-not (Test-Path -LiteralPath (Join-Path $homePath 'importado.json'))) { throw 'Primero importar la mudanza FINAL.' }
  $import=Get-Content -Raw -LiteralPath (Join-Path $homePath 'importado.json') | ConvertFrom-Json
  if($import.kind -eq 'preparation'){throw 'Esta copia es de preparacion: el origen sigue recibiendo fichas. Primero pasar la copia FINAL actualizada. Se puede completar por control remoto; no hay que copiar las claves a mano.'}
  if (Get-NetTCPConnection -State Listen -LocalPort 8788 -ErrorAction SilentlyContinue) { throw 'El puerto 8788 esta ocupado. Revisar antes de iniciar otra copia.' }
  $confirm = Read-Host 'La PC anterior debe seguir DETENIDA. Escribe ORIGEN DETENIDO para iniciar esta'
  if ($confirm -cne 'ORIGEN DETENIDO') { throw 'No se inicio la app.' }
  [IO.File]::WriteAllText((Join-Path $homePath 'active.json'), (@{at=(Get-Date).ToString('o')} | ConvertTo-Json), $utf8)
  Add-Task 'GuardiaSchestakow-App' (Join-Path $homePath 'asistente\run.ps1')
  Start-ScheduledTask -TaskName 'GuardiaSchestakow-App'
  $ready = $false
  for ($n=0; $n -lt 30; $n++) { Start-Sleep 1; try { $r = Invoke-WebRequest 'http://127.0.0.1:8788/api/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) {$ready=$true;break} } catch {} }
  if (-not $ready) { throw 'No respondio. Abrir Revisar: el informe indicara el error. No reactivar el origen mientras esta tarea siga activa.' }
  Write-Host 'La app inicio. Arrancara con Windows, sin abrir ninguna ventana. Se comprobara de nuevo al reiniciar.'
  Start-Process 'http://127.0.0.1:8788/login'
}
function Get-ChromePath {
  $paths=@((Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),(Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'))
  if(${env:ProgramFiles(x86)}){$paths+=(Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')}
  foreach($path in $paths){if(Test-Path -LiteralPath $path){return $path}}
  return $paths[0]
}
function Open-RemotePage {
  Start-Process -FilePath (Get-ChromePath) -ArgumentList 'https://remotedesktop.google.com/access/'
}
function Setup-Remote([switch]$DeferBrowser) {
  Write-Host 'Se instalara el acceso remoto de Google. No hace falta abrir puertos del router.'
  $source = $kit
  if (-not (Test-Path -LiteralPath (Join-Path $source 'prerequisitos'))) { $source = (Read-Host 'Carpeta del instalador original').Trim('"') }
  Assert-Kit $source
  $chrome=Get-ChromePath
  if (-not (Test-Path -LiteralPath $chrome)) { Invoke-SignedInstaller (Join-Path $source 'prerequisitos\chrome-x64.msi') '/qn /norestart REBOOT=ReallySuppress' 'Google' }
  if(-not (Get-Service chromoting -ErrorAction SilentlyContinue)){Invoke-SignedInstaller (Join-Path $source 'prerequisitos\chrome-remote-desktop.msi') '/qn /norestart REBOOT=ReallySuppress' 'Google'}
  Write-Host 'En la pagina: inicia sesion con TU cuenta, elige Configurar acceso remoto, nombre HOSPITAL-NUEVA y un PIN propio.'
  Write-Host 'Desde tu casa: misma pagina y misma cuenta. Elige HOSPITAL e ingresa el PIN. No nos pases esa clave.'
  if(-not $DeferBrowser){Open-RemotePage}
  Write-Host 'El registro de la PC y la prueba desde tu casa todavia deben completarse en Google.'
}
function Prepare-Guardia {
  # Remote support comes first so a later app/import error can be fixed from home.
  Setup-Remote -DeferBrowser
  $archive=Join-Path (Split-Path -Parent $kit) 'DATOS-Y-CLAVES.guardia'
  try {
    if(-not (Test-Path -LiteralPath $archive)){throw 'Falta DATOS-Y-CLAVES.guardia junto a la carpeta Guardia-Instalador. Copiar toda la carpeta del pendrive al disco de esta PC.'}
    if(-not (Test-Path -LiteralPath (Join-Path $homePath 'instalado.json'))){Install-Guardia}
    if(-not (Test-Path -LiteralPath (Join-Path $homePath 'importado.json'))){Import-Guardia -File $archive}
  } finally {Open-RemotePage}
  Write-Host 'Programas, datos y claves preparados. El origen sigue activo y esta copia no envia reclamos.'
  Write-Host 'Completar en Google el registro y PIN. El cambio final de servidor sigue pendiente para incluir las ultimas fichas.'
}
function Setup-Internet {
  if (-not (Test-Path -LiteralPath (Join-Path $homePath 'active.json'))) { throw 'Primero activar y comprobar la app local.' }
  $hostname = (Read-Host 'Nombre completo del dominio YA registrado en Cloudflare (por ejemplo guardia.tudominio.com.ar)').Trim().ToLowerInvariant()
  if ($hostname -notmatch '^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$') { throw 'Nombre de dominio no valido.' }
  Write-Host 'Se abrira Cloudflare: entra con TU cuenta y autoriza el dominio. Si aun no tenes dominio, completa ese paso primero.'
  $cf = Join-Path $homePath 'runtime\cloudflare\cloudflared.exe'
  $cert = Join-Path $homePath 'cloudflare\cert.pem'
  Protect-Folder (Join-Path $homePath 'cloudflare')
  if (-not (Test-Path -LiteralPath $cert)) {
    $loginCert = Join-Path $env:USERPROFILE '.cloudflared\cert.pem'
    if (-not (Test-Path -LiteralPath $loginCert)) { & $cf tunnel login; if ($LASTEXITCODE -ne 0) {throw 'No se completo el inicio de sesion de Cloudflare.'} }
    if (-not (Test-Path -LiteralPath $loginCert)) { throw 'No se encontro el certificado del dominio autorizado.' }
    Copy-Item -LiteralPath $loginCert -Destination $cert
  }
  $name = 'guardia-' + [Guid]::NewGuid().ToString('N').Substring(0,12)
  $cred = Join-Path $homePath 'cloudflare\tunnel.json'
  if (Test-Path -LiteralPath $cred) { throw 'Ya existe un tunel. Revisar su estado antes de crear otro.' }
  & $cf tunnel --origincert $cert create --credentials-file $cred $name
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el tunel.' }
  $id = (Get-Content -Raw -LiteralPath $cred | ConvertFrom-Json).TunnelID
  & $cf tunnel --origincert $cert route dns $id $hostname
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo asociar el dominio. El tunel creado se conserva para revisarlo; no se reemplaza DNS existente.' }
  $config = Join-Path $homePath 'cloudflare\config.yml'
  $yaml = "tunnel: $id`ncredentials-file: '" + $cred.Replace('\','/') + "'`ningress:`n  - hostname: $hostname`n    service: http://127.0.0.1:8788`n  - service: http_status:404`n"
  [IO.File]::WriteAllText($config, $yaml, $utf8)
  & $cf tunnel --config $config ingress validate
  if ($LASTEXITCODE -ne 0) { throw 'La configuracion del tunel no paso la revision.' }
  [IO.File]::WriteAllText((Join-Path $homePath 'public.json'), (@{url=('https://' + $hostname)} | ConvertTo-Json), $utf8)
  Add-Task 'GuardiaSchestakow-Tunel' (Join-Path $homePath 'asistente\tunnel.ps1')
  Stop-ScheduledTask -TaskName 'GuardiaSchestakow-App'
  Start-Sleep 3
  Start-ScheduledTask -TaskName 'GuardiaSchestakow-App'
  Start-ScheduledTask -TaskName 'GuardiaSchestakow-Tunel'
  Write-Host ('Enlace previsto: https://' + $hostname + ' y /mis-datos. Falta comprobarlo desde el celular con Wi-Fi apagado.')
  Write-Host 'Google Maps puede requerir autorizar este nuevo dominio en la cuenta de Google. WhatsApp requiere su webhook/token vigente.'
}
function Update-Guardia {
  $source = (Read-Host 'Carpeta COMPLETA del nuevo instalador descomprimido').Trim('"')
  Assert-Kit $source
  if (-not (Test-Path -LiteralPath (Join-Path $homePath 'importado.json'))) {throw 'No hay una instalacion importada para actualizar'}
  $backup = Join-Path $homePath ('version-anterior-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  Protect-Folder $backup
  $task = Get-ScheduledTask -TaskName 'GuardiaSchestakow-App' -ErrorAction SilentlyContinue
  $running = $task -and $task.State -eq 'Running'
  try {
    if ($running) {Stop-ScheduledTask -TaskName 'GuardiaSchestakow-App';Start-Sleep 3}
    if (Get-NetTCPConnection -State Listen -LocalPort 8788 -ErrorAction SilentlyContinue) {throw 'La app sigue activa. No se actualiza con datos en uso.'}
    foreach ($dir in @('app','runtime','asistente','recursos')) {if(Test-Path -LiteralPath (Join-Path $homePath $dir)){Copy-Item -LiteralPath (Join-Path $homePath $dir) -Destination $backup -Recurse}}
    # The generic kit has no private baselines/configuration/var: these remain in place.
    foreach ($dir in @('app','runtime','asistente','recursos')) {New-Item -ItemType Directory -Force -Path (Join-Path $homePath $dir) | Out-Null; Copy-Item -Path (Join-Path $source ($dir+'\*')) -Destination (Join-Path $homePath $dir) -Recurse -Force}
    Copy-Item -LiteralPath (Join-Path $source 'manifest.json') -Destination $homePath -Force
    Write-Host ('Actualizacion aplicada. Version anterior conservada en ' + $backup)
  } finally {if ($running) {Start-ScheduledTask -TaskName 'GuardiaSchestakow-App'}}
  Write-Host 'Abrir Revisar y comprobar pantallas antes de dar por terminada la actualizacion.'
}
try {
  if ($Action -eq 'Menu') {
    Write-Host "`nHOSPITAL SCHESTAKOW - INSTALACION Y MUDANZA`n"
    Write-Host '1 Revisar equipo y archivos (no instala)'
    Write-Host '2 Instalar en ESTA computadora'
    Write-Host '3 Importar mudanza final'
    Write-Host '4 Activar la app (origen detenido)'
    Write-Host '5 Preparar control remoto desde casa'
    Write-Host '6 Configurar dominio e internet'
    Write-Host '7 Crear respaldo cifrado (detiene y vuelve a iniciar la app)'
    Write-Host '8 Actualizar app desde un nuevo instalador (conserva datos y version previa)'
    Write-Host '0 Salir'
    $selection = Read-Host 'Numero'
    $map = @{'1'='Check';'2'='Install';'3'='Import';'4'='Activate';'5'='Remote';'6'='Internet';'7'='Backup';'8'='Update'}
    if (-not $map.ContainsKey($selection)) { exit 0 }
    $Action = $map[$selection]
  }
  if ($Action -notin @('Check') -and -not (Test-Administrator)) {
    if($ElevationAttempted){throw 'Windows abrio el asistente, pero no concedio un token de administrador. No se intento elevar otra vez.'}
    $powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-Action',$Action,'-ElevationAttempted')
    if($NoPause){$arguments+='-NoPause'}
    try {
      Write-Host 'Windows va a pedir autorizacion de administrador una sola vez. Acepta esa ventana para continuar.'
      $child=Start-Process -FilePath $powershell -Verb RunAs -ArgumentList $arguments -Wait -PassThru -ErrorAction Stop
      if($null -eq $child){throw 'Windows no inicio el asistente elevado.'}
      exit $child.ExitCode
    } catch {
      if($_.Exception.Message -match 'canceled by the user|cancelled by the user|El usuario cancel|cancelado por el usuario|operacion cancelada'){
        throw 'Se cancelo el permiso de Windows. No se instalo ni modifico nada.'
      }
      throw ('Windows no pudo abrir el asistente con permisos de administrador: '+$_.Exception.Message)
    }
  }
  switch ($Action) {
    'Check' { Assert-Computer $homePath; if (Test-Path -LiteralPath (Join-Path $kit 'prerequisitos')) { Assert-Kit $kit }; & (Join-Path $PSScriptRoot 'check.ps1') }
    'Install' { Install-Guardia }
    'Import' { Import-Guardia }
    'Activate' { Activate-Guardia }
    'Remote' { Setup-Remote }
    'Internet' { Setup-Internet }
    'Backup' { & (Join-Path $PSScriptRoot 'backup.ps1') }
    'Update' { Update-Guardia }
    'Prepare' { Prepare-Guardia }
  }
  Write-Host "`nPaso terminado. Los servicios de internet y acceso remoto se verifican en sus pasos propios."
} catch { Write-Host ("`nNO SE COMPLETO: " + $_.Exception.Message) -ForegroundColor Red; $global:LASTEXITCODE = 1 }
if(-not $NoPause){[void](Read-Host 'Enter para cerrar')}
