@echo off
title Hospital Schestakow - Instalacion
if not exist "%~dp0manifest.json" (
  echo Extrae TODO el ZIP antes de abrir este archivo.
  pause
  exit /b 1
)
if not exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" (
  echo Este Windows no tiene PowerShell. No se puede instalar esta version.
  echo Necesitamos Windows 10/11 de 64 bits. No se cambio nada.
  pause
  exit /b 1
)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "if ($PSVersionTable.PSVersion.Major -lt 5) { Write-Host 'Windows/PowerShell antiguo. Este paquete requiere Windows 10/11 de 64 bits. No se cambio nada.'; exit 2 }"
if errorlevel 1 (
  pause
  exit /b 1
)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0asistente\wizard.ps1"
pause
