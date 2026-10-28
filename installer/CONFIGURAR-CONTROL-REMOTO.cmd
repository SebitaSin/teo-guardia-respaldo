@echo off
title Hospital Schestakow - Control remoto desde casa
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0asistente\wizard.ps1" -Action Remote
pause
