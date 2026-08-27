@echo off
title LedgerDex - Status
color 0B

echo.
echo  =====================================================
echo   LedgerDex - System Status
echo  =====================================================
echo.

cd /d "%~dp0.."

REM Check Docker
where docker >nul 2>&1
if not errorlevel 1 (
    echo  [Docker Containers]
    docker compose ps
    echo.
) else (
    echo  [INFO] Docker not found. Checking Node process...
)

REM Get LAN IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do (
    set IP=%%a
    goto :got_ip
)
:got_ip
set IP=%IP: =%

REM Check health endpoint
echo  [Health Check]
curl -s http://localhost:3100/api/health 2>nul | findstr /C:"ok" >nul
if errorlevel 1 (
    curl -s http://localhost:3000/api/health 2>nul | findstr /C:"ok" >nul
    if errorlevel 1 (
        echo  [WARN] LedgerDex does not appear to be running.
    ) else (
        echo  [OK] LedgerDex is running at http://localhost:3000
        echo  [OK] LAN access: http://%IP%:3000
    )
) else (
    echo  [OK] LedgerDex is running at http://localhost:3100
    echo  [OK] LAN access: http://%IP%:3100
)

echo.
pause
