@echo off
title IncidentHub - Dev Server
cd /d "%~dp0"

echo ===================================================
echo        IncidentHub - Starting Dev Server
echo ===================================================
echo.

:: Check for node_modules
if not exist "node_modules\" (
    echo [!] node_modules not found. Running npm install...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b %errorlevel%
    )
)

:: Check for .env file
if not exist ".env" (
    if exist ".env.example" (
        echo [*] .env not found. Creating from .env.example...
        copy .env.example .env
    )
)

:: Ensure Prisma Client is generated
if not exist "node_modules\.prisma\client" (
    echo [*] Generating Prisma Client...
    call npx prisma generate
)

echo.
echo [INFO] URLs available:
echo   - User Portal:      http://localhost:3000
echo   - Admin Dashboard:  http://localhost:3000/admin
echo   - Architecture:     http://localhost:3000/architecture
echo   - MCP Insights:     http://localhost:3000/api/mcp/v1/insights
echo.
echo [INFO] Press Ctrl+C in this window to stop the server.
echo ===================================================
echo.

call npm run dev

if errorlevel 1 (
    echo.
    echo [ERROR] Server terminated with error code %errorlevel%.
    pause
)
