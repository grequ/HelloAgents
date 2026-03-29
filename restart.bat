@echo off
echo Stopping backend...
taskkill /F /IM python3.11.exe 2>nul
taskkill /F /IM python.exe 2>nul
timeout /t 2 /nobreak >nul

echo Starting backend...
cd /d %~dp0backend
start /b python -m uvicorn main:app --reload --port 8000
cd /d %~dp0

echo.
echo Backend started on http://localhost:8000
echo Frontend (Vite) should already be running on http://localhost:3000
echo.
echo If frontend is not running, open another terminal and run:
echo   cd frontend ^&^& npm run dev
echo.
pause
