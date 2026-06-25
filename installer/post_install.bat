@echo off
REM Runs once after `constructor` unpacks the env (Windows). %PREFIX% is the install dir.

REM Unpack the app bundle into the prefix (Windows 10+ ships bsdtar as tar.exe), then
REM remove the archive.
if exist "%PREFIX%\app_bundle.tar.gz" (
  tar -xzf "%PREFIX%\app_bundle.tar.gz" -C "%PREFIX%"
  del /q "%PREFIX%\app_bundle.tar.gz"
)

REM Optional pip-only extras (needs internet). Conda specs already cover the runtime.
"%PREFIX%\python.exe" -m pip install --no-input "uvicorn[standard]" >nul 2>&1

echo.
echo ============================================================
echo  atomipy installed to: %PREFIX%
echo  Start it with:  "%PREFIX%\launch_atomipy.bat"
echo  then open http://127.0.0.1:8000 (opens automatically).
echo ============================================================
echo.
