@echo off
title Hospital Schestakow - Instalar y preparar
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0asistente\wizard.ps1" -Action Prepare -NoPause
pause
