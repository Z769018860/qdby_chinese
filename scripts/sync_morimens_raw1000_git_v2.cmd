@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0\.."

where python >nul 2>nul || (echo [ERROR] Python 3.10+ is required.& pause& exit /b 1)
where git >nul 2>nul || (echo [ERROR] Git is required.& pause& exit /b 1)

git rev-parse --is-inside-work-tree >nul 2>nul || (
  echo [ERROR] Run this script from the qdby_chinese repository.
  pause
  exit /b 1
)

set "SEASON=69"
if not "%~2"=="" set "SEASON=%~2"

if "%~1"=="" (
  set "INPUT=%CD%\raw.zip"
) else (
  set "INPUT=%~f1"
)

set "TEMP_RAW=%CD%\.data\morimens-raw1000\%SEASON%\raw"
set "ARCHIVE_DIR=%CD%\data\morimens\eremora\raw-archives\%SEASON%"
set "ARCHIVE_DEST=%ARCHIVE_DIR%\top1000-raw.zip"

echo ==============================================
echo Morimens Eremora Top1000 import + Git sync v2
echo ==============================================
echo Input : %INPUT%
echo Season: %SEASON%
echo.

if not exist "%INPUT%" (
  echo [ERROR] Input does not exist:
  echo   %INPUT%
  echo.
  echo Usage:
  echo   scripts\sync_morimens_raw1000_git_v2.cmd "D:\path\raw.zip" 69
  echo or:
  echo   scripts\sync_morimens_raw1000_git_v2.cmd "D:\path\raw-folder" 69
  pause
  exit /b 1
)

echo [1/7] Updating repository...
git pull --rebase --autostash origin main
if errorlevel 1 (echo [ERROR] git pull failed.& pause& exit /b 1)

echo [2/7] Preparing raw input...
if exist "%TEMP_RAW%" rmdir /s /q "%TEMP_RAW%"
mkdir "%TEMP_RAW%" >nul 2>nul

if exist "%INPUT%\*" (
  echo [INFO] Directory input detected.
  robocopy "%INPUT%" "%TEMP_RAW%" *.txt /E /R:2 /W:2 /NFL /NDL /NJH /NJS /NP
  if errorlevel 8 (echo [ERROR] Failed to copy raw directory.& pause& exit /b 1)

  if not exist "%ARCHIVE_DIR%" mkdir "%ARCHIVE_DIR%"
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Compress-Archive -Path '%TEMP_RAW%\*' -DestinationPath '%ARCHIVE_DEST%' -CompressionLevel Optimal -Force"
  if errorlevel 1 (echo [ERROR] Failed to create raw archive.& pause& exit /b 1)
) else (
  for %%F in ("%INPUT%") do set "EXT=%%~xF"
  if /I not "!EXT!"==".zip" (
    echo [ERROR] Input must be a raw directory or .zip file.
    pause
    exit /b 1
  )
  if not exist "%ARCHIVE_DIR%" mkdir "%ARCHIVE_DIR%"
  copy /Y "%INPUT%" "%ARCHIVE_DEST%" >nul
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Expand-Archive -LiteralPath '%INPUT%' -DestinationPath '%CD%\.data\morimens-raw1000\%SEASON%' -Force"
  if errorlevel 1 (echo [ERROR] Failed to extract raw.zip.& pause& exit /b 1)

  if exist "%CD%\.data\morimens-raw1000\%SEASON%\raw\*" (
    rem expected raw\*.txt layout
  ) else (
    rem zip may contain txt files directly
    robocopy "%CD%\.data\morimens-raw1000\%SEASON%" "%TEMP_RAW%" *.txt /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP
  )
)

for /f %%N in ('dir /b /a-d "%TEMP_RAW%\*.txt" 2^>nul ^| find /c /v ""') do set "RAW_COUNT=%%N"
echo [INFO] Raw txt files: !RAW_COUNT!
if !RAW_COUNT! LSS 1 (echo [ERROR] No raw txt files found after extraction.& pause& exit /b 1)
if not "!RAW_COUNT!"=="1000" echo [WARN] Expected 1000 raw files but found !RAW_COUNT!.

for %%F in ("%ARCHIVE_DEST%") do set "ARCHIVE_SIZE=%%~zF"
echo [INFO] Raw archive bytes: !ARCHIVE_SIZE!
if !ARCHIVE_SIZE! GEQ 104857600 (
  echo [ERROR] Raw archive is 100 MiB or larger and GitHub will reject a normal Git blob.
  echo [ERROR] Use Git LFS or reduce the archive before pushing.
  pause
  exit /b 1
)

echo [3/7] Structuring raw data...
python scripts\process_morimens_raw1000_v2.py ^
  --root "%CD%" ^
  --season %SEASON% ^
  --raw-dir ".data/morimens-raw1000/%SEASON%/raw"
set "PROC_RC=%ERRORLEVEL%"
if not "%PROC_RC%"=="0" (
  echo [WARN] Some raw snapshots were not parseable.
  echo [WARN] See data\morimens\eremora\parse-failures\%SEASON%.json
  echo [WARN] Retry UIDs: data\morimens\eremora\retry-uids\%SEASON%.txt
)

echo [4/7] Summary...
python -c "import json,pathlib; p=pathlib.Path(r'data/morimens/eremora/top1000/%SEASON%.json'); x=json.loads(p.read_text(encoding='utf-8')); print('[INFO] raw=',x.get('rawFileCount'),' parsed=',x.get('parsedUserCount'),' failed=',x.get('failedUserCount'))"

echo [5/7] Staging raw archive + structured outputs...
git add "data/morimens/eremora/raw-archives/%SEASON%/top1000-raw.zip"
git add "data/morimens/eremora/users/%SEASON%"
git add "data/morimens/eremora/top1000/%SEASON%.json"
git add "data/morimens/eremora/parse-failures/%SEASON%.json"
git add "data/morimens/eremora/retry-uids/%SEASON%.txt"
git add "data/morimens/eremora/seasons"
git add "data/morimens/eremora/stats"
git add "data/morimens/eremora/manifest.json"
git add "scripts/process_morimens_raw1000.py"
git add "scripts/process_morimens_raw1000_v2.py"
git add "scripts/sync_morimens_raw1000_git_v2.cmd"

git diff --cached --quiet
if not errorlevel 1 (
  echo [OK] No changes to commit.
  pause
  exit /b 0
)

echo [6/7] Commit...
git status --short
git commit -m "data: import Eremora Top1000 raw and structured season %SEASON%"
if errorlevel 1 (echo [ERROR] git commit failed.& pause& exit /b 1)

echo [7/7] Push...
for /l %%A in (1,1,5) do (
  git pull --rebase --autostash origin main
  if not errorlevel 1 (
    git push origin HEAD:main
    if not errorlevel 1 (
      echo.
      echo [OK] Upload completed.
      echo [OK] Raw archive : data\morimens\eremora\raw-archives\%SEASON%\top1000-raw.zip
      echo [OK] Structured  : data\morimens\eremora\seasons\%SEASON%.json
      echo [OK] User data   : data\morimens\eremora\users\%SEASON%
      echo [OK] Failures    : data\morimens\eremora\parse-failures\%SEASON%.json
      pause
      exit /b 0
    )
  )
  timeout /t %%A /nobreak >nul
)

echo [ERROR] Push failed after retries. The commit remains locally.
pause
exit /b 1
