@echo off
title LedgerDex - First-Time Installation
color 0A
echo.
echo  =====================================================
echo   LedgerDex - Property Tax Management System
echo   FIRST-TIME INSTALLATION
echo  =====================================================
echo.

REM Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js is not installed.
    echo  Please install Node.js from https://nodejs.org ^(LTS version^)
    echo  Then restart this installer.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo  [OK] Node.js %NODE_VERSION% found.

REM Check MySQL (optional when using Docker)
echo.
echo  [INFO] Checking Docker...
where docker >nul 2>&1
if errorlevel 1 (
    echo  [WARN] Docker not found. Using local MySQL instead.
    goto :local_install
) else (
    echo  [OK] Docker found. Using Docker for MySQL.
    goto :docker_install
)

:docker_install
echo.
echo  [INFO] Starting MySQL with Docker...
cd /d "%~dp0.."
docker compose up -d mysql
echo  [INFO] Waiting for MySQL to be ready...
timeout /t 15 /nobreak >nul

echo  [INFO] Installing dependencies...
call npm install
if errorlevel 1 ( echo [ERROR] npm install failed. & pause & exit /b 1 )

echo  [INFO] Generating Prisma client...
call npx prisma generate
if errorlevel 1 ( echo [ERROR] Prisma generate failed. & pause & exit /b 1 )

echo  [INFO] Running database migrations...
call npx prisma db push
if errorlevel 1 ( echo [ERROR] Database migration failed. & pause & exit /b 1 )

echo  [INFO] Seeding default users...
call npx ts-node --project tsconfig.seed.json prisma/seed.ts
if errorlevel 1 ( echo [WARN] Seed failed - you may need to create users manually. )

echo  [INFO] Building application...
call npm run build
if errorlevel 1 ( echo [ERROR] Build failed. & pause & exit /b 1 )

goto :done

:local_install
echo.
echo  [INFO] Installing dependencies...
cd /d "%~dp0.."
call npm install

echo  [INFO] Generating Prisma client...
call npx prisma generate

echo  [INFO] Please configure .env with your MySQL connection string.
echo  Then run: npx prisma db push
echo  Then run: npx ts-node --project tsconfig.seed.json prisma/seed.ts
echo  Then run: npm run build

:done
echo.
echo  =====================================================
echo   INSTALLATION COMPLETE!
echo  =====================================================
echo.
echo   Default login credentials:
echo     Username: admin      Password: admin123
echo     Username: encoder1   Password: encoder123
echo.
echo   To start the server, run: scripts\start.bat
echo.
pause
