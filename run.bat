@echo off
for %%i in (node.exe) do set NODEPATH=%%~$PATH:i
if "%NODEPATH%"=="" set NODEPATH="c:\Program Files\nodejs\node.exe"
if not exist "%NODEPATH%" goto FILENOTFOUND
if not exist server.js goto MISSINGSERVER
echo Running Dungeon. Hit Ctrl-C to end the session, and answer N to continue.
echo Navigate to http://localhost:1337/index.html 
"%NODEPATH%" server.js 1337
pause Hit any key to continue...
:RESTART
"%NODEPATH%" server.js 1337
goto RESTART

:MISSINGSERVER
echo server.js is the startup file for this application. You might be in the wrong directory...
dir /s server.js /b
goto :EOF

:FILENOTFOUND
echo Unable to find node.js on your path. It can be downloaded from http://nodejs.org
