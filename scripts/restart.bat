@echo off
title LedgerDex - Restart
color 0A

echo.
echo  Restarting LedgerDex...
echo.

cd /d "%~dp0.."

where docker >nul 2>&1
if not errorlevel 1 (
    docker compose restart app
    echo  [OK] Container restarted.
) else (
    echo  [INFO] Docker not found. Please restart the server manually.
)

echo.
pause
