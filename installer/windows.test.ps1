. (Join-Path $PSScriptRoot 'scripts\common.ps1')
$script:fakeVersion='6.0';$script:fakeBits=64;$script:fakeRam=8
function Get-CimInstance([string]$ClassName) {
  switch ($ClassName) {
    'Win32_OperatingSystem' {return [pscustomobject]@{Caption='Equipo interno de prueba';Version=$script:fakeVersion;BuildNumber='26300'}}
    'Win32_Processor' {return [pscustomobject]@{AddressWidth=$script:fakeBits}}
    'Win32_ComputerSystem' {return [pscustomobject]@{TotalPhysicalMemory=($script:fakeRam*1GB)}}
  }
}
$passed=0
foreach ($version in @('6.0','6.1','6.2','6.3')) {
  $script:fakeVersion=$version
  $rejected=$false
  try {Assert-Computer $env:TEMP} catch {if($_.Exception.Message -match 'Vista/7/8'){$rejected=$true}else{throw}}
  if(-not $rejected){throw 'Acepto un Windows antiguo'};$passed++
}
$script:fakeVersion='10.0';$script:fakeBits=32
try {Assert-Computer $env:TEMP;throw 'Acepto CPU 32 bits'} catch {if($_.Exception.Message -notmatch 'Vista/7/8'){throw}};$passed++
$script:fakeBits=64;$script:fakeRam=2
try {Assert-Computer $env:TEMP;throw 'Acepto poca RAM'} catch {if($_.Exception.Message -notmatch '4 GB'){throw}};$passed++
Write-Host ($passed.ToString() + ' casos de rechazo de requisitos: OK (datos internos, no prueba fisica en Vista/8).')
