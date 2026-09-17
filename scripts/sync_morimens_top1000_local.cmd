@echo off
setlocal EnableExtensions
cd /d "%~dp0.."
where node >nul 2>nul || (echo [ERROR] Node.js 22+ is required.& exit /b 1)
if "%~1"=="" (set "EREMORA_OUTPUT_DIR=%CD%\output\morimens-top1000") else (set "EREMORA_OUTPUT_DIR=%~f1")
if not exist "%EREMORA_OUTPUT_DIR%" mkdir "%EREMORA_OUTPUT_DIR%"
set EREMORA_USAGE_SEASONS=69
set EREMORA_USAGE_TARGET=1000
set EREMORA_USAGE_MAX_FETCH=349
set EREMORA_USAGE_BATCH_SIZE=1
set EREMORA_USAGE_BATCH_DELAY_MS=5000
set EREMORA_USAGE_CHECKPOINT_EVERY=1
set EREMORA_USAGE_STALE_DAYS=36500
echo [INFO] Incremental local sync; one request every 5 seconds.
echo [INFO] Checkpoint output: %EREMORA_OUTPUT_DIR%
echo [INFO] Press Ctrl+C to stop. Re-run this command to resume.
node scripts\sync_morimens_eremora_usage.mjs
if errorlevel 1 (echo [ERROR] Sync stopped; checkpoints remain in data\morimens\eremora\usage\69.json) else (echo [OK] Sync finished.)

