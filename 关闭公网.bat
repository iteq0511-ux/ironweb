@echo off
title IronWeb 关闭
cd /d %~dp0

echo ============================================
echo    正在关闭 IronWeb 公网服务...
echo ============================================
echo.

taskkill /f /im cloudflared.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1

echo 已关闭：
echo   - 公网隧道（cloudflared）
echo   - 本地网站服务（node）
echo.
echo 现在公网网址已失效，网站无法再访问。
echo 下次需要开放时，双击「启动公网.bat」即可。
echo.
pause
