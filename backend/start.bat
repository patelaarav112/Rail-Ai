@echo off
REM RailMind AI - resilient backend launcher.
REM If the API server exits for any reason (crash, an accidental Ctrl+C in
REM another window, etc.) this restarts it automatically instead of leaving
REM the whole app dead until someone notices and reruns it by hand - safer
REM to have running during a live demo. To stop it for real, close this
REM window or press Ctrl+C twice.
cd /d "%~dp0"

:loop
echo [RailMind] Starting backend on http://localhost:8000 ...
python -m uvicorn main:app --port 8000
echo [RailMind] Backend exited - restarting in 2 seconds (close this window to stop for real)...
timeout /t 2 >nul
goto loop
