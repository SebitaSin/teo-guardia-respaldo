@echo off
setlocal
title Revisar computadora para Guardia
echo Esta revision consulta el equipo. No instala programas ni cambia su configuracion.
echo.
set "REVISOR_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%REVISOR_PS%" (
  echo Este Windows no tiene PowerShell disponible.
  echo Abri Equipo o Mi PC, hace clic derecho y entra en Propiedades.
  echo Anota la version de Windows, el procesador, la memoria RAM y el tipo de sistema.
  echo No hace falta instalar nada para esta revision.
  pause
  exit /b 1
)
"%REVISOR_PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0REVISAR-EQUIPO.ps1"
echo.
pause
