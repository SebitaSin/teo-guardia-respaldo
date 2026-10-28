$ErrorActionPreference = 'Stop'
if($PSVersionTable.PSEdition -eq 'Desktop') {
  # A child of PowerShell 7 can inherit module search paths for incompatible
  # editions. Load the Windows module explicitly instead of relying on autoload.
  $env:PSModulePath=([IO.Path]::Combine([Environment]::GetFolderPath('MyDocuments'),'WindowsPowerShell\Modules'))+';'+(Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules')+';'+(Join-Path $PSHOME 'Modules')
  foreach($module in @('Microsoft.PowerShell.Security','Microsoft.PowerShell.Utility','Microsoft.PowerShell.Management')) {
    Import-Module (Join-Path $PSHOME ('Modules\'+$module+'\'+$module+'.psd1')) -ErrorAction Stop
  }
}
Add-Type -AssemblyName System.Security
$script:HomeGuardia = Join-Path $env:ProgramData 'GuardiaSchestakow'
function Read-TextSecret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  return [Net.NetworkCredential]::new('', $secure).Password
}
function Test-Administrator {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return ([Security.Principal.WindowsPrincipal]::new($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Protect-Folder([string]$Path) {
  New-Item -ItemType Directory -Force -Path $Path | Out-Null
  $directory=[IO.DirectoryInfo]::new($Path)
  # Read/persist only the DACL. Set-Acl on a fresh descriptor may request
  # SeSecurityPrivilege while reapplying it to an existing protected folder.
  if($PSVersionTable.PSEdition -eq 'Desktop') {$acl=$directory.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)}
  else {$acl=[IO.FileSystemAclExtensions]::GetAccessControl($directory,[Security.AccessControl.AccessControlSections]::Access)}
  $acl.SetAccessRuleProtection($true, $false)
  foreach($existing in @($acl.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier]))) {[void]$acl.RemoveAccessRuleSpecific($existing)}
  $inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
  foreach ($sid in @('S-1-5-18','S-1-5-32-544', [Security.Principal.WindowsIdentity]::GetCurrent().User.Value)) {
    $rule = [Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid), 'FullControl', $inherit, 'None', 'Allow')
    $acl.AddAccessRule($rule)
  }
  if($PSVersionTable.PSEdition -eq 'Desktop') {$directory.SetAccessControl($acl)}
  else {[IO.FileSystemAclExtensions]::SetAccessControl($directory,$acl)}
}
function Save-Secrets($Secrets, [string]$Path) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($Secrets | ConvertTo-Json -Depth 12 -Compress))
  $protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'LocalMachine')
  [IO.File]::WriteAllBytes($Path, $protected)
  [Array]::Clear($bytes, 0, $bytes.Length)
}
function Load-Secrets([string]$Path) {
  $plain = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($Path), $null, 'LocalMachine')
  try { return ([Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json) }
  finally { [Array]::Clear($plain, 0, $plain.Length) }
}
function Invoke-Archive([string]$Node, [string]$Mode, $Request) {
  $info = [Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $Node
  $info.Arguments = '"' + (Join-Path $PSScriptRoot 'archive.mjs') + '" ' + $Mode
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
  $p = [Diagnostics.Process]::new(); $p.StartInfo = $info
  [void]$p.Start()
  $outputTask = $p.StandardOutput.ReadToEndAsync()
  $errorTask = $p.StandardError.ReadToEndAsync()
  # Windows PowerShell 5.1/.NET Framework lacks StandardInputEncoding.
  # Write UTF-8 bytes directly so accents in paths/passwords survive unchanged.
  $inputBytes = [Text.Encoding]::UTF8.GetBytes(($Request | ConvertTo-Json -Depth 15 -Compress))
  $p.StandardInput.BaseStream.Write($inputBytes, 0, $inputBytes.Length)
  $p.StandardInput.BaseStream.Flush(); $p.StandardInput.Close()
  [Array]::Clear($inputBytes, 0, $inputBytes.Length)
  $p.WaitForExit()
  $output = $outputTask.Result; $failure = $errorTask.Result
  if ($p.ExitCode -ne 0) { throw $failure.Trim() }
  return ($output | ConvertFrom-Json)
}
function Assert-Kit([string]$Kit) {
  Write-Host 'Comprobando todos los archivos del instalador...'
  $manifest = Get-Content -Raw -LiteralPath (Join-Path $Kit 'manifest.json') | ConvertFrom-Json
  foreach ($item in $manifest.files.PSObject.Properties) {
    if ($item.Name -match '(^/|\.\.|:|\\)') { throw 'Ruta incorrecta en el manifiesto' }
    $file = Join-Path $Kit $item.Name
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw ('Falta: ' + $item.Name) }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.Value) { throw ('Archivo danado: ' + $item.Name) }
  }
}
function Invoke-SignedInstaller([string]$File, [string]$Arguments, [string]$Publisher) {
  $signature = Get-AuthenticodeSignature -LiteralPath $File
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch $Publisher) { throw ('No se pudo verificar el fabricante de ' + (Split-Path $File -Leaf) + '. Revisar fecha, certificados e internet.') }
  if ($File.EndsWith('.msi')) { $p = Start-Process msiexec.exe -ArgumentList ('/i "' + $File + '" ' + $Arguments) -PassThru -Wait -WindowStyle Hidden }
  else { $p = Start-Process -FilePath $File -ArgumentList $Arguments -PassThru -Wait -WindowStyle Hidden }
  if ($p.ExitCode -notin @(0,3010,1641,1638)) { throw ('No se completo la instalacion. Codigo: ' + $p.ExitCode) }
  if ($p.ExitCode -in @(3010,1641)) { Write-Host 'Windows requiere reiniciar para completar este componente.' }
}
function Assert-Computer([string]$Destination) {
  $os = Get-CimInstance Win32_OperatingSystem
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  $ram = [Math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)
  Write-Host ($os.Caption + ' | ' + $ram + ' GB RAM | CPU ' + $cpu.AddressWidth + ' bits')
  if ([Version]$os.Version -lt [Version]'10.0' -or $cpu.AddressWidth -ne 64 -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
    throw 'Esta version necesita Windows 10/11 de 64 bits (Intel/AMD). Vista/7/8 o 32 bits no sirven para este paquete. No se borro nada. Copiar el informe y preparar Windows compatible o Linux con respaldo previo.'
  }
  if ($ram -lt 3.5) { throw 'Se necesitan al menos 4 GB de RAM.' }
  $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($Destination))
  if ($drive.AvailableFreeSpace -lt 30GB) { throw 'Liberar espacio: se necesitan al menos 30 GB libres.' }
  if ([int]$os.BuildNumber -lt 22000) { Write-Host 'Windows 10: comprobar que tenga soporte de seguridad vigente (ESU). Se recomienda Windows 11 compatible.' }
  $probe = Join-Path $env:TEMP ('guardia-check-' + [Guid]::NewGuid().ToString('N') + '.tmp')
  [IO.File]::WriteAllText($probe, 'ok'); [IO.File]::Delete($probe)
}
