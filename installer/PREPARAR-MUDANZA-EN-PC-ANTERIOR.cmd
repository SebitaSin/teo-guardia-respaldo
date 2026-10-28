@echo off
title Hospital Schestakow - Mudanza definitiva
echo Ejecutar en la PC ACTUAL, con el usuario de Windows que usa la app.
echo Esto DETIENE la app actual al confirmar MUDAR AHORA.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0asistente\export.ps1"
pause
