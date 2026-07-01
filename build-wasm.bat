@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ============================================================
REM  编译 Unlock Music 的两个 WASM 模块
REM  （QmcWasmBundle.js / KgmWasmBundle.js）
REM  仅在产物丢失或修改了 C++ 源码时需要运行。
REM  说明详见 README_CN.md
REM ============================================================

cd /d "%~dp0"

set "EMSDK_DIR=%CD%\build\emsdk"
set "EMSDK_VER=3.0.0"

REM ---- 1. 确保 emscripten 已安装 ----
if not exist "%EMSDK_DIR%\upstream\emscripten\emcc.py" (
    echo [提示] 未检测到 emscripten，开始下载安装 %EMSDK_VER% ...
    if not exist "%EMSDK_DIR%" (
        git clone --depth 1 https://github.com/emscripten-core/emsdk.git "%EMSDK_DIR%"
        if errorlevel 1 (
            echo [错误] 克隆 emsdk 失败，请检查网络。
            pause
            exit /b 1
        )
    )
    pushd "%EMSDK_DIR%"
    call emsdk.bat install %EMSDK_VER%
    call emsdk.bat activate %EMSDK_VER%
    popd
)

REM ---- 2. 定位 emsdk 自带的 python ----
set "EMSDK_PY="
for /d %%D in ("%EMSDK_DIR%\python\*") do set "EMSDK_PY=%%D\python.exe"
if not defined EMSDK_PY (
    echo [错误] 未找到 emsdk 自带 python，请检查 emsdk 安装是否完整。
    pause
    exit /b 1
)
set "EMCC=%EMSDK_DIR%\upstream\emscripten\emcc.py"
set "EMSDK=%EMSDK_DIR%"

echo.
echo [1/2] 编译 QmcWasmBundle.js ...
pushd "%CD%\src\QmcWasm"
"%EMSDK_PY%" "%EMCC%" QmcWasm.cpp -std=c++14 --bind -s NO_DYNAMIC_EXECUTION=1 -s MODULARIZE=1 -s EXPORT_NAME=QmcCryptoModule -s EXPORTED_RUNTIME_METHODS=getValue,writeArrayToMemory,UTF8ToString -s SINGLE_FILE=1 -O2 -o QmcWasmBundle.js
if errorlevel 1 (
    echo [错误] QmcWasmBundle 编译失败。
    popd
    pause
    exit /b 1
)
popd

echo.
echo [2/2] 编译 KgmWasmBundle.js ...
pushd "%CD%\src\KgmWasm"
"%EMSDK_PY%" "%EMCC%" KgmWasm.cpp -std=c++14 --bind -s NO_DYNAMIC_EXECUTION=1 -s MODULARIZE=1 -s EXPORT_NAME=KgmCryptoModule -s EXPORTED_RUNTIME_METHODS=getValue,writeArrayToMemory,UTF8ToString -s SINGLE_FILE=1 -O2 -o KgmWasmBundle.js
if errorlevel 1 (
    echo [错误] KgmWasmBundle 编译失败。
    popd
    pause
    exit /b 1
)
popd

echo.
echo ============================================================
echo   WASM 编译完成：
echo     src\QmcWasm\QmcWasmBundle.js
echo     src\KgmWasm\KgmWasmBundle.js
echo   现在可运行 start-web.bat 启动服务。
echo ============================================================
endlocal
pause
