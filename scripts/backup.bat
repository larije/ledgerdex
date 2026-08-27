@echo off
title LedgerDex - Backup
cd /d "%~dp0.."

for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set D=%%c-%%a-%%b
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set T=%%a%%b
set TIMESTAMP=%D%_%T%

set BACKUP_FILE=backups\ledgerdex_backup_%TIMESTAMP%.sql

echo Creating backup: %BACKUP_FILE%

where docker >nul 2>&1
if not errorlevel 1 (
    docker exec ledgerdex_mysql mysqldump -u root -pledgerdex123 ledgerdex > "%BACKUP_FILE%"
) else (
    echo [WARN] Docker not found. Use mysqldump manually.
)

if exist "%BACKUP_FILE%" (
    echo Backup saved: %BACKUP_FILE%
) else (
    echo [ERROR] Backup failed.
)
pause
