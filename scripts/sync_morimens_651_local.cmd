@echo off
setlocal
cd /d "%~dp0\.."
where node >nul 2>nul || (echo [ERROR] Node.js 22 or later is required.& pause & exit /b 1)
set EREMORA_LOCAL_SYNC=1
set EREMORA_LOCAL_SEASON=69
set EREMORA_MAX_RECORDS=651
set EREMORA_BATCH_SIZE=1
set EREMORA_BATCH_DELAY_MS=3500
echo Synchronizing missing Eremora details locally. Progress is saved after every user.
echo Press Ctrl+C at any time; run this file again to continue from the checkpoint.
node scripts\sync_morimens_eremora.mjs
if errorlevel 1 (echo [ERROR] Synchronization stopped. Existing checkpoints were preserved.) else (echo [OK] Local details are complete.)
pause
