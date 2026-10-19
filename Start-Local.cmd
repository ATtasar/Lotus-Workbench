@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请安装 Node.js 24 LTS：https://nodejs.org/，然后重新运行。
  pause
  exit /b 1
)
node "%~dp0scripts\local-windows.mjs" start %*
if errorlevel 1 (
  echo 操作失败，请保留上面的错误信息。
  pause
  exit /b 1
)
exit /b 0
