function Get-MigrationSecrets([string]$Source) {
# DPAPI must be opened by the original Windows user; do not elevate as a different user.
$secrets = @{ APP_SESSION_SECRET=(Get-Content -Raw -LiteralPath (Join-Path $Source 'server\session.secret')).Trim(); WHATSAPP_PUBLIC_NUMBER='2604056998' }
foreach ($spec in @(@('imap-credential.clixml','HOSPITAL_IMAP_PASSWORD'),@('openai-credential.clixml','OPENAI_API_KEY'),@('google-maps-credential.clixml','GOOGLE_MAPS_API_KEY'))) {
  $file = Join-Path $Source ('server\' + $spec[0])
  if (Test-Path -LiteralPath $file) {
    $cred = Import-Clixml -LiteralPath $file
    if ($cred -isnot [Management.Automation.PSCredential]) { throw 'No se pudo leer una credencial protegida. Ejecutar con el usuario original de Windows.' }
    $plain = $cred.GetNetworkCredential().Password
    $secrets[$spec[1]] = $plain
    if ($spec[0] -eq 'imap-credential.clixml') { $secrets.HOSPITAL_IMAP_ACCOUNT=$cred.UserName; $secrets.GMAIL_SYNC_ENABLED='true'; $secrets.GMAIL_SYNC_HOURS='24' }
    if ($spec[0] -eq 'google-maps-credential.clixml' -and $cred.UserName -match '^AIza[\w-]{30,}$' -and $cred.UserName -ne $plain) { $secrets.GOOGLE_MAPS_API_KEY=$cred.UserName; $secrets.GOOGLE_ROUTES_API_KEY=$plain }
  }
}
$waFile = Join-Path $Source 'server\whatsapp-credential.clixml'
if (Test-Path -LiteralPath $waFile) {
  $wa = Import-Clixml -LiteralPath $waFile
  $secrets.WHATSAPP_PHONE_NUMBER_ID = [string]$wa.phoneNumberId
  $secrets.WHATSAPP_GRAPH_VERSION = [string]$wa.graphVersion
  foreach ($item in @(@('accessToken','WHATSAPP_ACCESS_TOKEN'),@('appSecret','WHATSAPP_APP_SECRET'),@('verifyToken','WHATSAPP_VERIFY_TOKEN'))) {
    if ($null -ne $wa[$item[0]]) { if ($wa[$item[0]] -isnot [Security.SecureString]) { throw 'Credencial WhatsApp sin proteccion' }; $secrets[$item[1]] = [Net.NetworkCredential]::new('', $wa[$item[0]]).Password }
  }
}
$labFile = Join-Path $Source 'server\lab-credential.local.txt'
if (Test-Path -LiteralPath $labFile) {
  foreach ($line in Get-Content -LiteralPath $labFile -Encoding UTF8) {
    $at = $line.IndexOf('='); if ($at -lt 0) {continue}
    $key = $line.Substring(0,$at).Normalize([Text.NormalizationForm]::FormD) -replace '\p{Mn}',''
    $key = $key.ToUpperInvariant() -replace '[^A-Z]',''; $value = $line.Substring($at+1).Trim()
    if ($key -eq 'URL') {$secrets.LAB_BASE_URL=$value}
    elseif ($key -match '^(USUARIO|LOGIN)') {$secrets.LAB_LOGIN=$value}
    elseif ($key -match '^(CONTRASE|PASSWORD|CLAVE)') {$secrets.LAB_PASSWORD=$value}
  }
}
# The secure launcher also inherits explicitly configured environment variables.
# Never read .env: this project uses it for development placeholders.
foreach ($name in @('GOOGLE_MAPS_BROWSER_KEY','GOOGLE_MAPS_SERVER_KEY','GOOGLE_MAPS_API_KEY','GOOGLE_ROUTES_API_KEY','OPENAI_API_KEY','HOSPITAL_IMAP_ACCOUNT','HOSPITAL_IMAP_PASSWORD','LAB_BASE_URL','LAB_LOGIN','LAB_PASSWORD','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_GRAPH_VERSION','WHATSAPP_ACCESS_TOKEN','WHATSAPP_APP_SECRET','WHATSAPP_VERIFY_TOKEN','WHATSAPP_GROUP_ID','WHATSAPP_PUBLIC_NUMBER')) {
  $value = [Environment]::GetEnvironmentVariable($name,'Process')
  # start-secure.ps1 overrides these with its protected credential when present.
  if ($value -and -not $secrets.ContainsKey($name)) { $secrets[$name]=$value }
}
foreach ($name in @('GOOGLE_MAPS_BROWSER_KEY','GOOGLE_MAPS_SERVER_KEY','GOOGLE_MAPS_API_KEY','GOOGLE_ROUTES_API_KEY')) {
  if (-not $secrets.ContainsKey($name)) {
    $file = [Environment]::GetEnvironmentVariable(($name + '_FILE'),'Process')
    if ($file) {
      if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {throw ('Falta el archivo configurado para ' + $name)}
      $secrets[$name]=(Get-Content -Raw -LiteralPath $file).Trim()
    }
  }
}
if ($secrets.HOSPITAL_IMAP_ACCOUNT -and $secrets.HOSPITAL_IMAP_PASSWORD) {$secrets.GMAIL_SYNC_ENABLED='true';$secrets.GMAIL_SYNC_HOURS='24'}
return $secrets
}

function Get-MigrationCredentialInventory($Secrets) {
  @(
    [pscustomobject]@{Servicio='Clave original de los datos';Incluida=([string]$Secrets.APP_SESSION_SECRET).Length -ge 32}
    [pscustomobject]@{Servicio='Correo del hospital';Incluida=[bool]($Secrets.HOSPITAL_IMAP_ACCOUNT -and $Secrets.HOSPITAL_IMAP_PASSWORD)}
    [pscustomobject]@{Servicio='Google Maps - mapa';Incluida=[bool]($Secrets.GOOGLE_MAPS_BROWSER_KEY -or $Secrets.GOOGLE_MAPS_API_KEY)}
    [pscustomobject]@{Servicio='Google - rutas y geocodificacion';Incluida=[bool]($Secrets.GOOGLE_MAPS_SERVER_KEY -or $Secrets.GOOGLE_ROUTES_API_KEY)}
    [pscustomobject]@{Servicio='OpenAI - lectura de imagenes';Incluida=[bool]$Secrets.OPENAI_API_KEY}
    [pscustomobject]@{Servicio='WhatsApp - envio';Incluida=[bool]($Secrets.WHATSAPP_ACCESS_TOKEN -and $Secrets.WHATSAPP_PHONE_NUMBER_ID -and $Secrets.WHATSAPP_GRAPH_VERSION)}
    [pscustomobject]@{Servicio='WhatsApp - recepcion';Incluida=[bool]($Secrets.WHATSAPP_APP_SECRET -and $Secrets.WHATSAPP_VERIFY_TOKEN)}
    [pscustomobject]@{Servicio='Laboratorio';Incluida=[bool]($Secrets.LAB_BASE_URL -and $Secrets.LAB_LOGIN -and $Secrets.LAB_PASSWORD)}
  )
}
function Show-MigrationCredentials($Secrets) {
  Write-Host 'CLAVES QUE VIAJARAN EN LA MUDANZA CIFRADA (sin mostrar sus valores):'
  foreach($row in Get-MigrationCredentialInventory $Secrets) {
    if($row.Incluida){Write-Host ('INCLUIDA - ' + $row.Servicio)}
    else{Write-Host ('NO CONFIGURADA - ' + $row.Servicio)}
  }
  Write-Host 'Incluida significa guardada, no prueba que un proveedor acepte la clave. No se crean claves que falten ni se renuevan tokens vencidos.'
}
