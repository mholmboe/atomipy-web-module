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

REM Choose a port that won't clash with any existing local server. An explicit
REM ATOMIPY_PORT always wins; otherwise prefer 8000, else fall back to a free port.
REM connect_ex probe (a live listener == busy) — robust against TIME_WAIT.
set "PORT="
if not "%ATOMIPY_PORT%"=="" set "PORT=%ATOMIPY_PORT%"
if "%PORT%"=="" (
  for /f "usebackq delims=" %%i in (`""%HERE%python.exe" -c "import socket; print(8000 if socket.socket().connect_ex(('127.0.0.1',8000))!=0 else (lambda s:(s.bind(('127.0.0.1',0)),s.getsockname()[1])[1])(socket.socket()))"`) do set "PORT=%%i"
)
if "%PORT%"=="" set "PORT=8000"
if not "%PORT%"=="8000" echo (port 8000 busy or overridden -^> using %PORT%)

echo Starting atomipy at http://127.0.0.1:%PORT%  (close this window to stop)
start "" "http://127.0.0.1:%PORT%"

"%HERE%Scripts\uvicorn.exe" main:app --app-dir "%HERE%backend\core" --host 127.0.0.1 --port %PORT%
