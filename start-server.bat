@echo off
title Arayeshi Retail ERP Server (Port 4200)
cd /d "%~dp0"
echo ========================================================
echo  🚀 Arayeshi Retail ERP Server
echo  🌐 http://localhost:4200
echo ========================================================
echo.
node server.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Server stopped with error code %ERRORLEVEL%
    pause
)
