. (Join-Path $PSScriptRoot 'scripts\common.ps1')
. (Join-Path $PSScriptRoot 'scripts\credentials.ps1')
$root=Split-Path -Parent $PSScriptRoot
$testRoot=Join-Path $root ('_backups\2026-10-26-claves-icono-instalador\prueba-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path "$testRoot\server","$testRoot\var","$testRoot\src\data" | Out-Null
[IO.File]::WriteAllText("$testRoot\server\session.secret",('x'*48))
[IO.File]::WriteAllText("$testRoot\server\users.local.json",'[]')
foreach($spec in @(@('imap-credential.clixml','cuenta-interna','correo-interno'),@('openai-credential.clixml','openai','ia-interna'),@('google-maps-credential.clixml',('AIza'+('B'*35)),'rutas-internas'))) {
  $cred=[Management.Automation.PSCredential]::new($spec[1],(ConvertTo-SecureString $spec[2] -AsPlainText -Force))
  $cred | Export-Clixml -LiteralPath (Join-Path "$testRoot\server" $spec[0])
}
$wa=@{phoneNumberId='123';graphVersion='v23.0';accessToken=(ConvertTo-SecureString 'envio-interno' -AsPlainText -Force);appSecret=(ConvertTo-SecureString 'secreto-interno' -AsPlainText -Force);verifyToken=(ConvertTo-SecureString 'verificacion-interna' -AsPlainText -Force)}
$wa | Export-Clixml -LiteralPath "$testRoot\server\whatsapp-credential.clixml"
[IO.File]::WriteAllText("$testRoot\server\lab-credential.local.txt","URL=https://laboratorio.invalid`nLOGIN=prueba`nPASSWORD=clave-interna")
$secrets=Get-MigrationSecrets $testRoot
$rows=@(Get-MigrationCredentialInventory $secrets)
if($rows.Count -ne 8 -or @($rows | Where-Object {-not $_.Incluida}).Count -ne 0){throw 'Falta una integracion en el inventario ficticio'}
if($secrets.GOOGLE_MAPS_API_KEY -ne ('AIza'+('B'*35)) -or $secrets.GOOGLE_ROUTES_API_KEY -ne 'rutas-internas'){throw 'Se mezclaron claves de mapa y rutas'}
$node=Join-Path $root 'outputs\Guardia-Instalador\runtime\node\node.exe'
$phrase='frase-de-prueba-con-'+[char]0x00E1+'-2026'
[void](Invoke-Archive $node 'pack' @{root=$testRoot;output="$testRoot\copia.guardia";password=$phrase;secrets=$secrets;kind='final'})
$restored=Invoke-Archive $node 'unpack' @{input="$testRoot\copia.guardia";target="$testRoot\destino";password=$phrase}
Save-Secrets $restored.secrets "$testRoot\destino\claves.dpapi"
$saved=Load-Secrets "$testRoot\destino\claves.dpapi"
foreach($key in $secrets.Keys){if([string]$saved.$key -cne [string]$secrets[$key]){throw 'Una clave cambio durante la mudanza'}}
# Legacy Maps credential contains one browser key; it must not become a Routes key.
$legacy=[Management.Automation.PSCredential]::new('google-maps',(ConvertTo-SecureString 'mapa-antiguo-interno' -AsPlainText -Force))
$legacy | Export-Clixml -LiteralPath "$testRoot\server\google-maps-credential.clixml"
$old=Get-MigrationSecrets $testRoot
if($old.GOOGLE_MAPS_API_KEY -ne 'mapa-antiguo-interno' -or $old.GOOGLE_ROUTES_API_KEY -eq 'mapa-antiguo-interno'){throw 'El formato antiguo inventa una clave de rutas'}
Write-Host 'Claves: 8 integraciones ficticias, mapa/rutas separados, formato antiguo, frase con acento y coincidencia exacta tras cifrar/importar/proteger: OK'
