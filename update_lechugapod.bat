@echo off
setlocal EnableExtensions

set "URL=https://raw.githubusercontent.com/DarkSerpent/LechugaPod/refs/heads/main/lechugapod.xml"
set "DEST=%LOCALAPPDATA%\Cockatrice\Cockatrice\customsets"
set "FILE=%DEST%\lechugapod.xml"

if not exist "%DEST%" mkdir "%DEST%" >nul 2>&1

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; $url='%URL%'; $dest='%DEST%'; $file='%FILE%'; " ^
  "New-Item -ItemType Directory -Force -Path $dest | Out-Null; " ^
  "Invoke-WebRequest -Uri $url -OutFile $file -UseBasicParsing"

if errorlevel 1 (
    echo.
    echo Failed to download lechugapod.xml.
    echo.
    pause
    exit /b 1
)

tasklist /FI "IMAGENAME eq cockatrice.exe" 2>nul | find /I "cockatrice.exe" >nul
if not errorlevel 1 (
    taskkill /IM cockatrice.exe /T /F >nul 2>&1
)

echo.
echo LechugaPod custom set updated successfully. You can now reopen Cockatrice.
echo.
pause

endlocal
exit /b 0