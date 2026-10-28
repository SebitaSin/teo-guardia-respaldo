param([string]$Source = '')
. (Join-Path $PSScriptRoot 'common.ps1')
$kit = Split-Path -Parent $PSScriptRoot
try {
  Assert-Kit $kit
  if (-not $Source) { $Source = (Read-Host 'Carpeta actual de la app (la que contiene server y var)').Trim('"') }
  $Source = (Resolve-Path -LiteralPath $Source).Path
  if (-not (Test-Path -LiteralPath (Join-Path $Source 'server\users.local.json')) -or -not (Test-Path -LiteralPath (Join-Path $Source 'server\session.secret'))) { throw 'Esa carpeta no contiene la app original con sus claves.' }
  Write-Host 'MUDANZA DEFINITIVA: se detendran la app y el enlace del personal en ESTA PC.'
  Write-Host 'Hacerlo al final, cuando la otra PC ya tenga preparado el instalador. No vuelvas a arrancar esta copia si activaste la nueva.'
  $output = (Read-Host 'Ruta completa del archivo a guardar (por ejemplo E:\Mudanza.guardia)').Trim('"')
  if (-not $output.EndsWith('.guardia')) { throw 'El nombre debe terminar en .guardia' }
  if (Test-Path -LiteralPath $output) { throw 'Ese archivo ya existe; elegi un nombre nuevo.' }
  $password = Read-TextSecret 'Elegi una frase de respaldo de al menos 16 caracteres (guardala fuera de la PC)'
  if ($password.Length -lt 16 -or $password -cne (Read-TextSecret 'Repeti la frase')) { throw 'Las frases no coinciden o son demasiado cortas.' }
  . (Join-Path $PSScriptRoot 'credentials.ps1')
  $secrets = Get-MigrationSecrets $Source
  Show-MigrationCredentials $secrets
  if (Get-NetTCPConnection -State Listen -LocalPort 8788 -ErrorAction SilentlyContinue) {
    [void](Invoke-Archive (Join-Path $kit 'runtime\node\node.exe') 'source-check' @{root=$Source;secrets=$secrets})
  }
  $confirm = Read-Host 'Escribe MUDAR AHORA para detener esta copia y guardar la mudanza final'
  if ($confirm -cne 'MUDAR AHORA') { throw 'No se detuvo ni copio nada.' }
  # Only processes explicitly belonging to this exact app. Stop the link supervisor first.
  $processes = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Source) -and $_.Name -match '^(node|python|pythonw|powershell|pwsh)(\.exe)?$' -and $_.ProcessId -ne $PID })
  $linkProcesses = @($processes | Where-Object { $_.CommandLine -match 'iniciar-enlace-personal|enlace-personal\.mjs' })
  foreach ($proc in $linkProcesses) { Stop-Process -Id $proc.ProcessId -ErrorAction Stop }
  foreach ($proc in $processes | Where-Object { $_.CommandLine -match 'server[/\\]start\.mjs|imap_sync\.py|ingest_pending\.py|photo_reader\.py' }) { Stop-Process -Id $proc.ProcessId -ErrorAction Stop }
  # Source starts can use a relative command line: verify the listener's actual entry path.
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 8788 -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    $proc = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $listener.OwningProcess)
    if ($proc.Name -eq 'node.exe' -and $proc.CommandLine -match 'server[/\\]start\.mjs') { Stop-Process -Id $proc.ProcessId -ErrorAction Stop }
    else { throw 'Hay otro programa en 8788: no se detuvo por seguridad. La copia no se hizo.' }
  }
  Start-Sleep 3
  if (Get-NetTCPConnection -State Listen -LocalPort 8788 -ErrorAction SilentlyContinue) { throw 'La app sigue activa. No se puede certificar una copia final.' }
  $result = Invoke-Archive (Join-Path $kit 'runtime\node\node.exe') 'pack' @{root=$Source;output=$output;password=$password;secrets=$secrets;kind='final'}
  $password=$null; $secrets=$null
  Write-Host ('Mudanza cifrada guardada: ' + $output + ' | ' + $result.count + ' archivos.')
  Write-Host 'Origen detenido. Lleva este archivo y el instalador a la otra PC. La frase se ingresa alli. No vuelvas a iniciar esta copia si activaste la nueva.'
} catch { Write-Host ('NO SE COMPLETO: ' + $_.Exception.Message) -ForegroundColor Red; Write-Host 'Si ya se detuvo el origen, permanece detenido. Conserva el original; no actives dos copias.' }
[void](Read-Host 'Enter para cerrar')
