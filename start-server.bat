@echo off
echo 🚀 Starting Campus Crush Backend Server...
echo.

REM Kill any existing node processes
taskkill /F /IM node.exe >nul 2>&1

REM Wait a moment
timeout /t 2 /nobreak >nul

REM Start the server
echo ✅ Starting server.js on port 5001...
node server.js

pause