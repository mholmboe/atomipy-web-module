@echo off
REM Launch the atomipy web-module from a `constructor`-built install (Windows).
REM This .bat lives at the install prefix root, so %~dp0 IS the conda env.
setlocal

set "HERE=%~dp0"

REM Put the bundled env on PATH so the backend (and subprocesses) find the bundled
REM gmx.exe, python, OpenMM, etc. The Simulate node's default "GROMACS path" = gmx then
REM resolves to the bundled CPU GROMACS; a custom path typed into the node overrides it.
set "PATH=%HERE%;%HERE%Library\bin;%HERE%Scripts;%PATH%"

set "PYTHONPATH=%HERE%"
set "FRONTEND_DIST=%HERE%dist"
set "PYTHONIOENCODING=utf-8"
if "%SIMULATION_MODE%"=="" set "SIMULATION_MODE=full"

set "PORT=8000"
if not "%ATOMIPY_PORT%"=="" set "PORT=%ATOMIPY_PORT%"

echo Starting atomipy at http://127.0.0.1:%PORT%  (close this window to stop)
start "" "http://127.0.0.1:%PORT%"

"%HERE%Scripts\uvicorn.exe" main:app --app-dir "%HERE%backend\core" --host 127.0.0.1 --port %PORT%
