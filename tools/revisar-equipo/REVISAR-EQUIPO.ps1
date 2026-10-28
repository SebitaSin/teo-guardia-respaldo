# Compatible con sintaxis de Windows PowerShell 2.0. No requiere administrador.
# Solo consulta propiedades del sistema y escribe un informe breve en el Escritorio.
param([string]$OutputDirectory = '')
$ErrorActionPreference = 'Stop'

function Read-EquipoClass([string]$className) {
  if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) {
    try { return @(Get-CimInstance -ClassName $className -ErrorAction Stop) } catch { }
  }
  if (Get-Command Get-WmiObject -ErrorAction SilentlyContinue) {
    return @(Get-WmiObject -Class $className -ErrorAction Stop)
  }
  throw 'No se pudo consultar la informacion del equipo con este PowerShell.'
}

try {
  $operating = @(Read-EquipoClass 'Win32_OperatingSystem')[0]
  $computer = @(Read-EquipoClass 'Win32_ComputerSystem')[0]
  $processors = @(Read-EquipoClass 'Win32_Processor')
  $systemDisks = @(Read-EquipoClass 'Win32_LogicalDisk' | Where-Object { $_.DeviceID -eq $env:SystemDrive })
  $cpuNames = @($processors | ForEach-Object { ([string]$_.Name).Trim() }) -join ' / '
  $cpu64 = @($processors | Where-Object { $_.DataWidth -eq 64 }).Count -gt 0
  $cpuBits = '32 bits o no determinado'
  if ($cpu64) { $cpuBits = '64 bits' }
  $ramGb = [Math]::Round(([double]$computer.TotalPhysicalMemory / 1GB), 1)
  $diskText = 'No determinado'
  if ($systemDisks.Count -gt 0) {
    $systemDisk = $systemDisks[0]
    $diskText = ('{0} {1} GB libres de {2} GB' -f $systemDisk.DeviceID, [Math]::Round(([double]$systemDisk.FreeSpace / 1GB), 1), [Math]::Round(([double]$systemDisk.Size / 1GB), 1))
  }
  $lines = @(
    'REVISION DE EQUIPO PARA GUARDIA SCHESTAKOW',
    ('Fecha: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')),
    ('Windows: ' + [string]$operating.Caption),
    ('Version: ' + [string]$operating.Version),
    ('Tipo de Windows: ' + [string]$operating.OSArchitecture),
    ('Procesador: ' + $cpuNames),
    ('Capacidad del procesador: ' + $cpuBits),
    ('Memoria RAM: ' + $ramGb + ' GB'),
    ('Disco del sistema: ' + $diskText),
    '',
    'No se consultaron pacientes, personal, claves, documentos ni archivos de la plataforma.',
    'Esta revision no mide salud del disco ni certifica que el equipo sea apto.',
    'No se instalaron programas ni se cambio la configuracion.'
  )
  $desktop = [Environment]::GetFolderPath('Desktop')
  if ($OutputDirectory) { $desktop = [IO.Path]::GetFullPath($OutputDirectory) }
  $reportPath = Join-Path $desktop 'REVISION-EQUIPO-GUARDIA.txt'
  $encoding = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $true
  [IO.File]::WriteAllText($reportPath, ($lines -join [Environment]::NewLine), $encoding)
  $lines | ForEach-Object { Write-Output $_ }
  Write-Output ''
  Write-Output ('Informe guardado en: ' + $reportPath)
} catch {
  Write-Output ('No se pudo terminar la revision: ' + $_.Exception.Message)
  Write-Output 'Abri Equipo o Mi PC > Propiedades y anota Windows, procesador, RAM y tipo de sistema.'
  exit 1
}
