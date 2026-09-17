@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0\.."

where python >nul 2>nul || (
  echo [ERROR] Python 3.10+ is required.
  pause
  exit /b 1
)
where git >nul 2>nul || (
  echo [ERROR] Git is required.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>nul || (
  echo [ERROR] Run this script inside the qdby_chinese repository.
  pause
  exit /b 1
)

set "SEASON=69"
if not "%~2"=="" set "SEASON=%~2"

if "%~1"=="" (
  set "RAW_SOURCE=%CD%\output\morimens-top1000\raw"
) else (
  set "RAW_SOURCE=%~f1"
)

set "RAW_DEST=%CD%\data\morimens\eremora\raw\%SEASON%"

if not exist "%RAW_SOURCE%" (
  echo [ERROR] Raw source directory not found:
  echo   %RAW_SOURCE%
  echo.
  echo Usage:
  echo   scripts\sync_morimens_raw1000_git.cmd "D:\path\to\output\morimens-top1000\raw" 69
  pause
  exit /b 1
)

for /f %%N in ('dir /b /a-d "%RAW_SOURCE%\*.txt" 2^>nul ^| find /c /v ""') do set "RAW_COUNT=%%N"
echo [INFO] Raw source: %RAW_SOURCE%
echo [INFO] Raw files : %RAW_COUNT%
echo [INFO] Season    : %SEASON%
echo.

if %RAW_COUNT% LSS 1 (
  echo [ERROR] No .txt raw files found.
  pause
  exit /b 1
)

echo [1/5] Updating repository before import...
git pull --rebase origin main
if errorlevel 1 (
  echo [ERROR] git pull --rebase failed.
  pause
  exit /b 1
)

echo [2/5] Copying raw snapshots into repository...
if not exist "%RAW_DEST%" mkdir "%RAW_DEST%"
robocopy "%RAW_SOURCE%" "%RAW_DEST%" *.txt /E /R:2 /W:2 /NFL /NDL /NJH /NJS /NP
set "RC=%ERRORLEVEL%"
if %RC% GEQ 8 (
  echo [ERROR] robocopy failed with code %RC%.
  pause
  exit /b %RC%
)

echo [3/5] Structuring raw Top1000 data...
python scripts\process_morimens_raw1000.py --root "%CD%" --season %SEASON% --raw-dir "data/morimens/eremora/raw/%SEASON%"
set "PROC_RC=%ERRORLEVEL%"
if not "%PROC_RC%"=="0" (
  echo [WARN] Processor reported one or more parse failures.
  echo [WARN] See data\morimens\eremora\parse-failures\%SEASON%.json
  echo [WARN] Parsed outputs are still staged below.
)

echo [4/5] Staging Eremora raw and structured data...
git add "data/morimens/eremora/raw/%SEASON%"
git add "data/morimens/eremora/users/%SEASON%"
git add "data/morimens/eremora/top1000/%SEASON%.json"
git add "data/morimens/eremora/parse-failures/%SEASON%.json"
git add "data/morimens/eremora/seasons"
git add "data/morimens/eremora/stats"
git add "data/morimens/eremora/manifest.json"
git add "scripts/process_morimens_raw1000.py"
git add "scripts/sync_morimens_raw1000_git.cmd"

git diff --cached --quiet
if not errorlevel 1 (
  echo [OK] No changes to commit.
  pause
  exit /b 0
)

git status --short

echo [5/5] Commit and push...
git commit -m "data: import Eremora Top1000 raw season %SEASON%"
if errorlevel 1 (
  echo [ERROR] git commit failed.
  pause
  exit /b 1
)

for /l %%A in (1,1,5) do (
  git pull --rebase origin main
  if errorlevel 1 (
    echo [WARN] Pull/rebase attempt %%A failed.
  ) else (
    git push origin HEAD:main
    if not errorlevel 1 (
      echo.
      echo [OK] Top1000 raw and structured Eremora data pushed successfully.
      echo [OK] Raw path      : data\morimens\eremora\raw\%SEASON%
      echo [OK] User records  : data\morimens\eremora\users\%SEASON%
      echo [OK] Top1000 index : data\morimens\eremora\top1000\%SEASON%.json
      echo.
      pause
      exit /b 0
    )
  )
  timeout /t %%A /nobreak >nul
)

echo [ERROR] Failed to push after retries. Commit remains locally.
pause
exit /b 1
