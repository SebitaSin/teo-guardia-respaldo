. (Join-Path $PSScriptRoot 'common.ps1')
$base = Split-Path -Parent $PSScriptRoot
$installed = Test-Path -LiteralPath (Join-Path $base 'instalado.json')
$env:PYTHONDONTWRITEBYTECODE = '1'
$rows = New-Object 'System.Collections.Generic.List[object]'
function Result([string]$Item, [string]$State, [string]$Detail) { $rows.Add([pscustomobject]@{item=$Item;estado=$State;detalle=$Detail}); Write-Host ($State + ' - ' + $Item + ': ' + $Detail) }
foreach ($name in @('runtime\node\node.exe','runtime\python\python.exe','runtime\cloudflare\cloudflared.exe','app\dist\index.html','app\server\start.mjs','app\scripts\imap_sync.py','app\scripts\vendor\pypdf\__init__.py','app\scripts\vendor\xlrd\__init__.py')) {
  if (Test-Path -LiteralPath (Join-Path $base $name)) { Result $name 'OK' 'Incluido' } else { Result $name 'FALTA' 'Volver a extraer el instalador completo' }
}
foreach ($spec in @(@('Node','runtime\node\node.exe','--version'),@('Python','runtime\python\python.exe','--version'),@('Tunel','runtime\cloudflare\cloudflared.exe','--version'))) {
  try { $text = & (Join-Path $base $spec[1]) $spec[2] 2>&1; if ($LASTEXITCODE -ne 0) {throw 'No pudo iniciar'}; Result $spec[0] 'OK' ([string]$text) } catch {Result $spec[0] 'ERROR' 'No inicia: revisar Windows y Visual C++'}
}
try {
  & (Join-Path $base 'runtime\python\python.exe') (Join-Path $PSScriptRoot 'python-check.py')
  if ($LASTEXITCODE -ne 0) {throw 'Biblioteca faltante'}
  Result 'Bibliotecas Python' 'OK' 'SSL, SQLite, compresion, PDF, Excel e imagenes'
} catch { Result 'Bibliotecas Python' 'ERROR' 'Reinstalar requisitos desde el asistente' }
try { [void][Net.Dns]::GetHostAddresses('www.cloudflare.com'); Result 'DNS' 'OK' 'Resuelve nombres de internet' } catch {Result 'DNS' 'ERROR' 'Revisar Wi-Fi o conexion'}
foreach ($url in @('https://www.cloudflare.com/cdn-cgi/trace','https://api.openai.com','https://www.google.com')) {
  try { $response = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 15; Result $url 'OK' 'Conexion HTTPS disponible' }
  catch { if ($_.Exception.Response) {Result $url 'OK' 'Servidor alcanzable; no es una prueba de credenciales'} else {Result $url 'ERROR' 'No conecta: comprobar fecha, Wi-Fi, certificados o firewall'} }
}
if ($installed) {
  foreach ($name in @('server\users.local.json','src\data\staff.json','src\data\catalog.json','src\data\internacion.json','var\continuidad\autogestion.enc.json')) {
    if (Test-Path -LiteralPath (Join-Path $base ('app\' + $name))) {Result $name 'OK' 'Conservado'} else {Result $name 'PENDIENTE' 'Comprobar mudanza; no se crean datos de reemplazo'}
  }
  foreach ($task in @('GuardiaSchestakow-App','GuardiaSchestakow-Tunel')) {
    $t = Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
    if ($t) { Result $task 'OK' ([string]$t.State) } else {Result $task 'PENDIENTE' 'Se crea al activar ese paso'}
  }
  if (Test-Path -LiteralPath (Join-Path $base 'secrets.dpapi')) {
    try {
      $secrets = Load-Secrets (Join-Path $base 'secrets.dpapi')
      foreach ($spec in @(@('Correo','HOSPITAL_IMAP_PASSWORD'),@('IA','OPENAI_API_KEY'),@('Mapa','GOOGLE_MAPS_API_KEY'),@('Rutas','GOOGLE_ROUTES_API_KEY'),@('WhatsApp','WHATSAPP_ACCESS_TOKEN'),@('Laboratorio','LAB_PASSWORD'))) {
        if ($secrets.($spec[1])) {Result $spec[0] 'CONFIGURADO' 'Credencial presente. Falta probar contra el servicio real.'} else {Result $spec[0] 'PENDIENTE' 'Sin credencial; copiar la app no activa esta integracion'}
      }
      $secrets = $null
    } catch { Result 'Claves' 'ERROR' 'Windows no pudo abrir las claves protegidas' }
  }
  try {
    $r = Invoke-WebRequest 'http://127.0.0.1:8788/api/health' -UseBasicParsing -TimeoutSec 4
    if ($r.StatusCode -eq 200) {Result 'Servidor local' 'OK' 'Responde'}
  } catch {Result 'Servidor local' 'PENDIENTE' 'No esta activo o no responde'}
  $service = Get-Service -Name 'chromoting' -ErrorAction SilentlyContinue
  if ($service) {Result 'Control remoto' 'INSTALADO' ('Servicio ' + $service.Status + '. Falta confirmar conexion desde tu casa.')} else {Result 'Control remoto' 'PENDIENTE' 'Usar paso 5'}
  if (Test-Path -LiteralPath (Join-Path $base 'public.json')) {
    $url = (Get-Content -Raw -LiteralPath (Join-Path $base 'public.json') | ConvertFrom-Json).url
    try { $r = Invoke-WebRequest ($url + '/login') -UseBasicParsing -TimeoutSec 15; Result 'Enlace publico' 'OK' 'Login alcanzable desde esta PC; falta probar desde otra red' } catch {Result 'Enlace publico' 'ERROR' 'Revisar tunel y DNS'}
  } else { Result 'Enlace publico' 'PENDIENTE' 'Sin dominio fijo configurado' }
}
$report = Join-Path $env:TEMP ('Guardia-revision-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
$rows | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $report -Encoding UTF8
Write-Host ('Informe sin claves ni nombres de personas: ' + $report)
Write-Host 'Un componente incluido no certifica su servicio. Reinicio, correo, laboratorio, Maps, WhatsApp y acceso desde otra red se prueban por separado.'
