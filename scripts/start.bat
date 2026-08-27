@echo off
title LedgerDex - Starting Server
color 0A

echo.
echo  Starting LedgerDex...
echo.

cd /d "%~dp0.."

REM Start MySQL if Docker is available
where docker >nul 2>&1
if not errorlevel 1 (
    docker compose up -d mysql >nul 2>&1
    timeout /t 3 /nobreak >nul
)

REM Get local IP for LAN sharing
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do (
    set IP=%%a
    goto :got_ip
)
:got_ip
set IP=%IP: =%

echo  =====================================================
echo   LedgerDex is STARTING...
echo  =====================================================
echo.
echo   This PC:    http://localhost:3100
echo   Other PCs:  http://%IP%:3100
echo.
echo   Press Ctrl+C to stop the server.
echo.

set NODE_ENV=production
REM PORT must be a real env var - the standalone server ignores PORT from .env
set PORT=3100
node .next\standalone\server.js
