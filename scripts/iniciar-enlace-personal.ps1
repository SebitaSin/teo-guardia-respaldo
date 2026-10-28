param(
  [ValidateRange(1, 48)][int]$Hours = 24,
  [string]$Cloudflared = '',
  [switch]$Worker,
  [string]$Until = ''
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $projectRoot 'var\enlace-personal-session.json'
$linkPath = Join-Path $projectRoot 'var\enlace-personal.txt'
$nodeScript = Join-Path $PSScriptRoot 'enlace-personal.mjs'
New-Item -ItemType Directory -Path (Join-Path $projectRoot 'var') -Force | Out-Null
function Read-LinkState {
  try { Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json } catch { $null }
}
function Write-LinkState($value) {
  [IO.File]::WriteAllText($statePath, ($value | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
}
if (-not $Worker) {
  $existing = Read-LinkState
  if ($existing -and $existing.status -eq 'running' -and ($existing.continuous -or ($existing.expiresAt -and [DateTimeOffset]::Parse($existing.expiresAt) -gt [DateTimeOffset]::UtcNow))) {
    $active = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$existing.linkPid)" -ErrorAction SilentlyContinue
    if ($active -and $active.Name -eq 'node.exe' -and $active.CommandLine.Contains($nodeScript)) {
      Write-Output $existing.url
      if($existing.continuous){Write-Output 'El mismo enlace sigue activo sin corte por horario. Depende de esta PC y su conexion.'}
      else{Write-Output ('En segundo plano hasta ' + [DateTimeOffset]::Parse($existing.expiresAt).ToOffset([TimeSpan]::FromHours(-3)).ToString('dd/MM/yyyy HH:mm') + ' (Buenos Aires).')}
      return
    }
  }
  if (-not $Cloudflared) { $Cloudflared = Join-Path $projectRoot 'tools\cloudflared.exe' }
  $Cloudflared = (Get-Command $Cloudflared -ErrorAction Stop).Source
  $expires = [DateTimeOffset]::UtcNow.AddHours($Hours).ToString('o')
  Write-LinkState @{ status = 'starting'; expiresAt = $expires; url = $null }
  $arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $MyInvocation.MyCommand.Path + '" -Worker -Until "' + $expires + '" -Cloudflared "' + $Cloudflared + '"'
  Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -WindowStyle Hidden -WorkingDirectory $projectRoot -ArgumentList $arguments -RedirectStandardOutput (Join-Path $projectRoot 'var\enlace-personal-worker.log') -RedirectStandardError (Join-Path $projectRoot 'var\enlace-personal-worker-error.log') | Out-Null
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Seconds 1
    $state = Read-LinkState
    if ($state.status -eq 'running') {
      Write-Output $state.url
      Write-Output ('En segundo plano hasta ' + [DateTimeOffset]::Parse($state.expiresAt).ToOffset([TimeSpan]::FromHours(-3)).ToString('dd/MM/yyyy HH:mm') + ' (Buenos Aires).')
      Write-Output 'Podes cerrar esta ventana. La PC debe seguir encendida y conectada a internet.'
      return
    }
    if ($state.status -eq 'failed') { throw $state.error }
  }
  throw 'El enlace no termino de iniciar. Revisar var\enlace-personal-worker-error.log.'
}
$expiresAt = [DateTimeOffset]::Parse($Until)
$previousLink = if (Test-Path -LiteralPath $linkPath) { (Get-Content -LiteralPath $linkPath -Raw).Trim() } else { '' }
$node = $null
$status = @{ status = 'starting'; workerPid = $PID; expiresAt = $expiresAt.ToString('o'); url = $null }
try {
  $alive = Invoke-WebRequest -Uri 'http://127.0.0.1:8788/mis-datos' -UseBasicParsing -TimeoutSec 8
  if ($alive.StatusCode -ne 200) { throw 'La ficha del personal no responde en la app local.' }
  $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
  $node = Start-Process -FilePath $nodeExe -WindowStyle Hidden -WorkingDirectory $projectRoot -ArgumentList ('"' + $nodeScript + '" "' + $Cloudflared + '"') -PassThru -RedirectStandardOutput (Join-Path $projectRoot 'var\enlace-personal.log') -RedirectStandardError (Join-Path $projectRoot 'var\enlace-personal-error.log')
  $status.linkPid = $node.Id
  Write-LinkState $status
  for ($attempt = 0; $attempt -lt 55; $attempt++) {
    Start-Sleep -Seconds 1
    $node.Refresh()
    if ($node.HasExited) { throw 'El enlace se cerro durante el inicio. Revisar var\enlace-personal-error.log.' }
    $link = if (Test-Path -LiteralPath $linkPath) { (Get-Content -LiteralPath $linkPath -Raw).Trim() } else { '' }
    if ($link -and $link -ne $previousLink -and $link -match '^https://[a-z0-9-]+\.trycloudflare\.com/mis-datos$') {
      $status.status = 'running'; $status.url = $link; Write-LinkState $status
      break
    }
  }
  if ($status.status -ne 'running') { throw 'No se obtuvo una nueva direccion publica.' }
  while ([DateTimeOffset]::UtcNow -lt $expiresAt) {
    Start-Sleep -Seconds 5
    $node.Refresh()
    if ($node.HasExited) { throw 'El tunel se interrumpio. Comprobar la direccion antes de volver a compartirla.' }
  }
  $status.status = 'expired'
} catch {
  $status.status = 'failed'; $status.error = $_.Exception.Message
} finally {
  if ($node) {
    $node.Refresh()
    if (-not $node.HasExited) {
      Get-CimInstance Win32_Process -Filter "ParentProcessId = $($node.Id)" -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'cloudflared.exe' -and $_.CommandLine -match 'http://127\.0\.0\.1:8790' } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
      Start-Sleep -Seconds 1
      $node.Refresh()
      if (-not $node.HasExited) { Stop-Process -InputObject $node -ErrorAction SilentlyContinue }
    }
  }
  Write-LinkState $status
}
