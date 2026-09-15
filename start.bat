@echo off
chcp 65001 >nul
title IronWeb 启动器
cd /d "%~dp0"

echo ==============================================
echo   IronWeb 正在启动...
echo ==============================================

where node >nul 2>nul
if errorlevel 1 (
  echo [提示] 未检测到 Node.js，正在尝试自动安装（需要网络）...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements >nul 2>nul
  where node >nul 2>nul
  if errorlevel 1 (
    set "PATH=%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    where node >nul 2>nul
  )
  if errorlevel 1 (
    echo.
    echo [错误] Node.js 自动安装失败，请手动安装：
    echo        打开 https://nodejs.org 下载 LTS 版本并安装，然后重新双击本文件。
    echo.
    pause
    exit /b 1
  )
  echo [完成] Node.js 已就绪
)

node server.js
pause
