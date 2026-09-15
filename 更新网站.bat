@echo off
chcp 65001 >nul
title IronWeb - Update Site
cd /d "%~dp0"

echo ============================================
echo   IronWeb  Update Site
echo   1) Stage all changes
echo   2) Commit
echo   3) Push to GitHub
echo   Public site refreshes in about 1 minute.
echo ============================================
echo.

"C:\Program Files\Git\cmd\git.exe" add -A
"C:\Program Files\Git\cmd\git.exe" commit -m "site update %date% %time%"
"C:\Program Files\Git\cmd\git.exe" push origin main

echo.
echo ============================================
echo   Done! Public site will update in ~1 minute
echo ============================================
pause
