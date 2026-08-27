@echo off
title LedgerDex - Stopping
echo Stopping LedgerDex...
taskkill /f /im node.exe >nul 2>&1
where docker >nul 2>&1
if not errorlevel 1 (
    cd /d "%~dp0.."
    docker compose stop
)
echo LedgerDex stopped.
timeout /t 2 >nul
