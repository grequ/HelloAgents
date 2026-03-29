@echo off
echo ============================================
echo  AgentForge - Environment Setup
echo ============================================
echo.

REM Check if .env exists
if exist "%~dp0.env" (
    echo [OK] .env file found
) else (
    echo [..] Creating .env from template...
    copy "%~dp0.env.example" "%~dp0.env" >nul
    echo [!!] .env created — edit it to add your ANTHROPIC_API_KEY
    echo     Open .env and set: ANTHROPIC_API_KEY=sk-ant-your-key-here
    echo.
)

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [!!] Python not found. Install Python 3.11+ first.
    pause
    exit /b 1
)
echo [OK] Python found

REM Check Node
node --version >nul 2>&1
if errorlevel 1 (
    echo [!!] Node.js not found. Install Node.js 18+ first.
    pause
    exit /b 1
)
echo [OK] Node.js found

REM Install backend dependencies
echo.
echo [..] Installing backend dependencies...
cd /d "%~dp0backend"
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo [!!] Backend dependency install failed
    pause
    exit /b 1
)
echo [OK] Backend dependencies installed
cd /d "%~dp0"

REM Install frontend dependencies
echo.
echo [..] Installing frontend dependencies...
cd /d "%~dp0frontend"
call npm install --silent
if errorlevel 1 (
    echo [!!] Frontend dependency install failed
    pause
    exit /b 1
)
echo [OK] Frontend dependencies installed
cd /d "%~dp0"

echo.
echo ============================================
echo  Setup complete!
echo ============================================
echo.
echo Next steps:
echo   1. Make sure MySQL is running (docker compose up -d)
echo   2. Edit .env with your ANTHROPIC_API_KEY
echo   3. Run: restart.bat (starts backend)
echo   4. Run: cd frontend ^&^& npm run dev (starts frontend)
echo   5. Open http://localhost:3000
echo   6. Click "Load Demo Data" on the Dashboard
echo.
pause
