@echo off
rem Double-click launcher: starts the local server and opens the app.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH.
  echo Install it from https://nodejs.org and run this again,
  echo or serve this folder another way: python -m http.server
  pause
  exit /b 1
)

rem open the browser once the server has had a moment to bind
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process 'http://localhost:8123/'"

echo Serving on http://localhost:8123  -  close this window to stop the app.
node serve.mjs

echo.
echo The server stopped. If that was unexpected, the message above says why.
pause
