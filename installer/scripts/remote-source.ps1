param([Parameter(Mandatory=$true)][string]$Project)
. (Join-Path $PSScriptRoot 'common.ps1')
$package=Join-Path $Project 'outputs\Guardia-Instalador\prerequisitos\chrome-remote-desktop.msi'
$report=Join-Path $Project 'var\control-remoto-origen.json'
try{
  if(-not (Get-Service chromoting -ErrorAction SilentlyContinue)){
    $sig=Get-AuthenticodeSignature -LiteralPath $package
    if($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'Google'){throw 'No se pudo verificar el instalador de Google.'}
    # One Windows permission prompt for the signed MSI, never a PowerShell relaunch.
    $p=Start-Process (Join-Path $env:SystemRoot 'System32\msiexec.exe') -Verb RunAs -ArgumentList ('/i "'+$package+'" /qn /norestart REBOOT=ReallySuppress') -WindowStyle Hidden -Wait -PassThru
    if($p.ExitCode -notin @(0,3010,1638)){throw ('El host remoto no se completo. Codigo '+$p.ExitCode)}
  }
  $service=Get-Service chromoting -ErrorAction Stop
  @{hostInstalled=$true;serviceStatus=[string]$service.Status;accountRegistration='pending-user';externalConnection='not-tested'}|ConvertTo-Json|Set-Content -LiteralPath $report -Encoding UTF8
  $chrome=Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'
  Start-Process -FilePath $chrome -ArgumentList 'https://remotedesktop.google.com/access/'
}catch{
  @{hostInstalled=$false;error=$_.Exception.Message;accountRegistration='not-completed'}|ConvertTo-Json|Set-Content -LiteralPath $report -Encoding UTF8
}
