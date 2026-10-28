param([string]$Source='')
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'credentials.ps1')
try {
  if(-not $Source){$Source=(Read-Host 'Carpeta actual de la app (contiene server y var)').Trim('"')}
  $secrets=Get-MigrationSecrets (Resolve-Path -LiteralPath $Source).Path
  Show-MigrationCredentials $secrets
  $secrets=$null
  Write-Host 'Solo revision: no detuvo la app, no exporto claves ni envio datos.'
} catch {Write-Host $_.Exception.Message -ForegroundColor Red}
[void](Read-Host 'Enter para cerrar')
