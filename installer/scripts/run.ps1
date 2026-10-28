. (Join-Path $PSScriptRoot 'common.ps1')
$homePath = $script:HomeGuardia
if (-not (Test-Path -LiteralPath (Join-Path $homePath 'active.json'))) { throw 'Esta copia no fue activada.' }
$lock = $null
try {
  $lock = [IO.File]::Open((Join-Path $homePath 'servidor.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
  Add-Type 'using System; using System.Runtime.InteropServices; public static class GuardiaPower { [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags); }'
  [void][GuardiaPower]::SetThreadExecutionState([uint32]2147483649)
  $app = Join-Path $homePath 'app'
  $secrets = Load-Secrets (Join-Path $homePath 'secrets.dpapi')
  foreach ($property in $secrets.PSObject.Properties) { [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, 'Process') }
  $env:APP_ROOT = $app
  $env:APP_DATA_DIR = Join-Path $app 'var'
  $env:APP_USERS_FILE = Join-Path $app 'server\users.local.json'
  $env:APP_USERS_B64 = ''
  $env:APP_HOST = '127.0.0.1'
  $env:APP_PORT = '8788'
  $env:APP_COOKIE_SECURE = 'false'
  $env:APP_TRUST_PROXY = 'false'
  $env:PIZARRAS_FOLDER = Join-Path $app 'var\pizarras-entrada'
  $env:PYTHON_COMMAND = Join-Path $homePath 'runtime\python\python.exe'
  $env:PYTHONDONTWRITEBYTECODE = '1'
  $env:TZ = 'America/Argentina/Mendoza'
  $env:AI_COMPARE = 'false'
  if (Test-Path -LiteralPath (Join-Path $homePath 'public.json')) { $env:APP_COOKIE_SECURE = 'true'; $env:APP_TRUST_PROXY = 'true' }
  $node = Join-Path $homePath 'runtime\node\node.exe'
  $log = Join-Path $homePath ('servidor-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  if (Get-NetTCPConnection -State Listen -LocalPort 8788 -ErrorAction SilentlyContinue) { throw 'Puerto ocupado: no se mata un servidor desconocido.' }
  $p = Start-Process -FilePath $node -ArgumentList ('"' + (Join-Path $app 'server\start.mjs') + '"') -WorkingDirectory $app -PassThru -WindowStyle Hidden -RedirectStandardOutput ($log + '.log') -RedirectStandardError ($log + '.error.log')
  [IO.File]::WriteAllText((Join-Path $homePath 'app.pid'), [string]$p.Id)
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) { throw 'El servidor se detuvo. La tarea de Windows intentara iniciarlo nuevamente.' }
} finally {
  if ($lock) { $lock.Dispose() }
  if ('GuardiaPower' -as [type]) { [void][GuardiaPower]::SetThreadExecutionState([uint32]2147483648) }
}
