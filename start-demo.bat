@echo off
REM RailMind AI - one-click demo launcher. Opens the backend and frontend
REM each in their own window, both self-restarting if they crash (see
REM backend\start.bat / frontend\start.bat). Close either window to stop it.
cd /d "%~dp0"

start "RailMind Backend"  cmd /k backend\start.bat
start "RailMind Frontend" cmd /k frontend\start.bat

echo Backend and frontend are starting in separate windows.
echo Dashboard: http://localhost:5173
echo API docs:  http://localhost:8000/api/docs
