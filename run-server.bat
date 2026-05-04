@echo off
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -File ".\start-server.ps1"
pause
