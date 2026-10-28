. (Join-Path $PSScriptRoot 'common.ps1')
$homePath = $script:HomeGuardia
$file = (Read-Host 'Ruta completa del nuevo respaldo .guardia, preferentemente en un disco externo').Trim('"')
if (-not $file.EndsWith('.guardia') -or (Test-Path -LiteralPath $file)) {throw 'Usa un nombre nuevo terminado en .guardia'}
$password = Read-TextSecret 'Frase de respaldo (16 caracteres o mas)'
if ($password.Length -lt 16 -or $password -cne (Read-TextSecret 'Repeti la frase')) {throw 'Las frases no coinciden o son cortas'}
$task = Get-ScheduledTask -TaskName 'GuardiaSchestakow-App' -ErrorAction SilentlyContinue
$running = $task -and $task.State -eq 'Running'
try {
  if ($running) { Stop-ScheduledTask -TaskName 'GuardiaSchestakow-App'; Start-Sleep 3 }
  if (Get-NetTCPConnection -State Listen -LocalPort 8788 -ErrorAction SilentlyContinue) {throw 'El servidor sigue activo. No se hace una copia inconsistente.'}
  $result = Invoke-Archive (Join-Path $homePath 'runtime\node\node.exe') 'pack' @{root=(Join-Path $homePath 'app');output=$file;password=$password;secrets=(Load-Secrets (Join-Path $homePath 'secrets.dpapi'));kind='backup'}
  Write-Host ('Respaldo cifrado: ' + $file + ' (' + $result.count + ' archivos). Conservar tambien la frase fuera de esta PC.')
} finally {if ($running) {Start-ScheduledTask -TaskName 'GuardiaSchestakow-App'}}
