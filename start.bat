@echo off
title PaperQuest
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required but was not found.
  echo Install it from https://nodejs.org then run this again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing dependencies ^(1-2 minutes^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo npm install failed. & pause & exit /b 1 )
)

if not exist client\dist (
  echo Building the app...
  call npm run build
  if errorlevel 1 ( echo Build failed. & pause & exit /b 1 )
)

rem ---- Docling is the default PDF-to-Markdown converter (high quality) ----
where docling >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Docling ^(best PDF conversion^) is not installed yet.
  where python >nul 2>nul
  if errorlevel 1 (
    echo   Install Python 3.10+ from https://python.org, then run: pip install docling
  ) else (
    echo   Installing docling now ^(one-time, downloads models, a few minutes^)...
    call pip install --quiet docling
    if errorlevel 1 ( echo   Could not install docling automatically. Run: pip install docling )
  )
  echo   ^(Without docling, PaperQuest still works using a simpler built-in text extractor.^)
  echo.
)

echo.
echo   PaperQuest is starting at http://localhost:3001
echo   Keep this window open. Close it to stop the app.
echo.
start "" http://localhost:3001/
node server\index.js
pause
