. (Join-Path $PSScriptRoot 'common.ps1')
try {
  $homePath=$script:HomeGuardia
  if (-not (Test-Path -LiteralPath (Join-Path $homePath 'active.json'))) {throw 'Falta importar y activar la mudanza. Abri GUARDIA - Administrar.'}
  $url='http://127.0.0.1:8788'
  if(Test-Path -LiteralPath (Join-Path $homePath 'public.json')) {
    $url=[string](Get-Content -Raw -LiteralPath (Join-Path $homePath 'public.json') | ConvertFrom-Json).url
    if($url -notmatch '^https://[a-z0-9.-]+$'){throw 'El enlace configurado no es valido. Abri GUARDIA - Revisar.'}
  }
  [void](Invoke-WebRequest 'http://127.0.0.1:8788/api/health' -UseBasicParsing -TimeoutSec 5)
  Start-Process ($url+'/login')
} catch {Write-Host $_.Exception.Message -ForegroundColor Red;[void](Read-Host 'Enter para cerrar')}
