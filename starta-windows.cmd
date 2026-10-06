@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Installera Node.js 24 LTS fran https://nodejs.org och prova igen.
  pause
  exit /b 1
)
if not exist "node_modules\@turf\turf\package.json" (
  call npm ci --ignore-scripts
  if errorlevel 1 (
    echo Installationen misslyckades. Kontrollera internetanslutningen.
    pause
    exit /b 1
  )
)
echo Oppna http://127.0.0.1:3000 i din webblasare nar servern har startat.
node server.js
pause
