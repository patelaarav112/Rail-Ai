@echo off
REM RailMind AI - frontend dev server launcher, with the same auto-restart
REM safety net as backend\start.bat.
cd /d "%~dp0"

:loop
echo [RailMind] Starting frontend on http://localhost:5173 ...
call npm run dev
echo [RailMind] Frontend exited - restarting in 2 seconds (close this window to stop for real)...
timeout /t 2 >nul
goto loop
