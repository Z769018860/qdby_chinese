@echo off
setlocal
cd /d "%~dp0\.."
where node >nul 2>nul || (echo [ERROR] Node.js 22 or later is required.& pause & exit /b 1)
set EREMORA_LOCAL_SYNC=1
set EREMORA_LOCAL_SEASON=69
set EREMORA_MAX_RECORDS=651
set EREMORA_BATCH_SIZE=1
set EREMORA_BATCH_DELAY_MS=3500
if "%~1"=="" (set "EREMORA_OUTPUT_DIR=%CD%\output\morimens-651") else (set "EREMORA_OUTPUT_DIR=%~f1")
if not exist "%EREMORA_OUTPUT_DIR%" mkdir "%EREMORA_OUTPUT_DIR%"
echo Synchronizing missing Eremora details locally. Progress is saved after every user.
echo Press Ctrl+C at any time; run this file again to continue from the checkpoint.
echo Output: %EREMORA_OUTPUT_DIR%
node scripts\sync_morimens_eremora.mjs
if errorlevel 1 (echo [ERROR] Synchronization stopped. Existing checkpoints were preserved in "%EREMORA_OUTPUT_DIR%".) else (echo [OK] Results were written to "%EREMORA_OUTPUT_DIR%".)
pause
