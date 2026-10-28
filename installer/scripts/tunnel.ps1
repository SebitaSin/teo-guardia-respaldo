. (Join-Path $PSScriptRoot 'common.ps1')
$homePath = $script:HomeGuardia
$exe = Join-Path $homePath 'runtime\cloudflare\cloudflared.exe'
& $exe tunnel --config (Join-Path $homePath 'cloudflare\config.yml') run
exit $LASTEXITCODE
