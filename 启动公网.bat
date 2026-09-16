@echo off
title IronWeb 公网启动
cd /d %~dp0

echo ============================================
echo    IronWeb 一键启动（本地服务 + 免费公网穿透）
echo    服务将在后台静默运行，关闭本窗口不影响网站
echo ============================================
echo.

tasklist | find "node.exe" >nul 2>&1
if errorlevel 1 goto startnode
echo [1/3] 本地服务已在运行
goto step2
:startnode
echo [1/3] 启动本地服务...
powershell -NoProfile -Command "Start-Process -FilePath '%~dp0bin\node.exe' -ArgumentList 'server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
timeout /t 2 /nobreak >nul

:step2
tasklist | find "cloudflared.exe" >nul 2>&1
if errorlevel 1 goto starttunnel
echo [2/3] 隧道已在运行
goto step3
:starttunnel
echo [2/3] 建立公网隧道，等待约 10 秒...
if exist "%~dp0tunnel\url.log" del "%~dp0tunnel\url.log"
if exist "%~dp0tunnel\url_err.log" del "%~dp0tunnel\url_err.log"
powershell -NoProfile -Command "Start-Process -FilePath '%~dp0tunnel\cloudflared.exe' -ArgumentList 'tunnel','--url','http://localhost:3000','--no-autoupdate','--protocol','http2' -RedirectStandardOutput '%~dp0tunnel\url.log' -RedirectStandardError '%~dp0tunnel\url_err.log' -WindowStyle Hidden"

:step3
echo [3/3] 获取公网网址...
set URL=
for /l %%i in (1,1,40) do (
  for /f "usebackq delims=" %%a in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tunnel\get_url.ps1"`) do set URL=%%a
  if defined URL goto goturl
  timeout /t 1 /nobreak >nul
)
echo 未能获取网址，请查看 tunnel\url.log 或重试。
pause
exit /b

:goturl
echo.
echo ============================================
echo    公网网址（手机/电脑任何地方可访问，数据存本机）：
echo.
echo        %URL%
echo ============================================
echo %URL% > "%~dp0我的公网网址.txt"
echo %URL%| clip
echo 已复制到剪贴板，并保存到「我的公网网址.txt」
start "" "%URL%"
echo.
echo 提示：服务和隧道都在后台运行，本窗口现在可以关闭。
echo 需要关闭网站时，双击「关闭公网.bat」即可。
echo.
pause
