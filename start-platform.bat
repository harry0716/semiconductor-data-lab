@echo off
cd /d "%~dp0"
start "Semiconductor Data Lab Server" cmd /k "npm start"
timeout /t 2 >nul
start http://127.0.0.1:4174/frontend/index.html

