@echo off
setlocal enableextensions enabledelayedexpansion
title LedgerDex - Launcher
color 0A

cd /d "%~dp0"

echo.
echo  =====================================================
echo    LedgerDex - Starting the system
echo  =====================================================
echo.

REM --- 1. Check that Docker is installed ---
where docker >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Docker was not found on this PC.
    echo.
    echo  Install Docker Desktop from:
    echo    https://www.docker.com/products/docker-desktop/
    echo  then run this launcher again.
    echo.
    pause
    exit /b 1
)

REM --- 2. Make sure the Docker engine is running ---
docker info >nul 2>&1
if not errorlevel 1 goto docker_ready

echo  [INFO] Docker engine is not running. Starting Docker Desktop...
set "DD="
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" set "DD=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
if not defined DD if exist "%LocalAppData%\Docker\Docker\Docker Desktop.exe" set "DD=%LocalAppData%\Docker\Docker\Docker Desktop.exe"
if defined DD (
    start "" "%DD%"
) else (
    echo  [WARN] Could not find Docker Desktop automatically.
    echo         Please start it manually if this launcher stalls.
)

echo  [INFO] Waiting for the Docker engine ^(up to 90 seconds^)...
set /a _tries=0
:wait_docker
docker info >nul 2>&1
if not errorlevel 1 goto docker_ready
set /a _tries+=1
if !_tries! geq 45 (
    echo.
    echo  [ERROR] Docker engine did not start in time.
    echo          Open Docker Desktop, wait until it says "Running", then re-run this launcher.
    echo.
    pause
    exit /b 1
)
timeout /t 2 /nobreak >nul
goto wait_docker

:docker_ready
echo  [OK] Docker engine is ready.

REM --- 3. Start the containers ---
echo.
echo  [INFO] Starting LedgerDex...
echo         The first run builds the app and may take several minutes.
echo.
docker compose up -d
if errorlevel 1 (
    echo.
    echo  [ERROR] Could not start LedgerDex. See the messages above.
    echo.
    pause
    exit /b 1
)

REM --- 4. Wait until the app answers ---
echo.
echo  [INFO] Waiting for LedgerDex to be ready...
set /a _tries=0
:wait_app
curl -s -o NUL http://localhost:3100/api/health
if not errorlevel 1 goto app_ready
set /a _tries+=1
if !_tries! geq 60 (
    echo  [WARN] LedgerDex did not respond yet; it may still be starting.
    echo         Check status any time with:  docker compose ps
    goto show_urls
)
timeout /t 2 /nobreak >nul
goto wait_app

:app_ready
echo  [OK] LedgerDex is up.

:show_urls
set "IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do (
    if not defined IP set "IP=%%a"
)
if defined IP set "IP=%IP: =%"

echo.
echo  =====================================================
echo    LedgerDex is RUNNING
echo  =====================================================
echo.
echo    This PC:    http://localhost:3100
if defined IP echo    Other PCs:  http://%IP%:3100
echo.
echo    To stop it later:  scripts\stop.bat
echo    You can close this window - LedgerDex keeps running.
echo.

REM --- 5. Open the app in Zen Browser (falls back to default browser) ---
set "ZEN=C:\Program Files\Zen Browser\zen.exe"
if not exist "%ZEN%" set "ZEN=%LocalAppData%\Programs\zen-browser\zen.exe"
if exist "%ZEN%" (
    start "" "%ZEN%" "http://localhost:3100"
) else (
    start "" http://localhost:3100
)

REM --- 6. Make sure a Desktop shortcut exists ---
set "LDX_TARGET=%~f0"
set "LDX_HOME=%~dp0"
set "LDX_ICON=%~dp0davao-del-norte-seal.ico"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $lnk=Join-Path $d 'Start LedgerDex.lnk'; if(-not (Test-Path $lnk)){ $w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut($lnk); $s.TargetPath=$env:LDX_TARGET; $s.WorkingDirectory=$env:LDX_HOME; $s.WindowStyle=1; $s.Description='Start LedgerDex'; if(Test-Path $env:LDX_ICON){ $s.IconLocation=$env:LDX_ICON + ',0' }; $s.Save() }" >nul 2>&1

echo.
pause
endlocal
