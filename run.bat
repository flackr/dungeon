@echo off
for %%i in (node.exe) do set NODEPATH=%%~$PATH:i
if "%NODEPATH%"=="" set NODEPATH="c:\Program Files\nodejs\node.exe"
if not exist %NODEPATH% goto FILENOTFOUND
echo Running Dungeon. Hit Ctrl-C to end the session, and answer N to continue.
%NODEPATH% server\server.js 1337
pause Hit any key to continue...
:RESTART
%NODEPATH% server\server.js 1337
goto RESTART

:FILENOTFOUND
echo Unable to find node.js on your path. It can be downloaded from http://nodejs.org
