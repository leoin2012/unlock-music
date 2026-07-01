@echo off
chcp 65001 >nul
setlocal

REM ============================================================
REM  Unlock Music 本地 Web 服务一键启动脚本
REM  说明详见 README_CN.md
REM ============================================================

cd /d "%~dp0"

REM Node v16+ / v22 需要该选项，否则 Webpack4 会报 OpenSSL 错误
set "NODE_OPTIONS=--openssl-legacy-provider"

REM 依赖未安装时自动安装
if not exist "node_modules\.bin\vue-cli-service" (
    echo [提示] 未检测到依赖，正在执行 npm install ...
    call npm install
    if errorlevel 1 (
        echo [错误] npm install 失败，请检查网络或 Node 环境。
        pause
        exit /b 1
    )
)

REM WASM 产物缺失时提醒
if not exist "src\QmcWasm\QmcWasmBundle.js" (
    echo [警告] 缺少 QmcWasmBundle.js，QQ音乐/酷狗解密将无法使用。
    echo         请先运行 build-wasm.bat 编译 WASM 模块。
    echo.
)

echo ============================================================
echo   正在启动 Unlock Music 本地服务...
echo   编译完成后，请在浏览器打开下方显示的地址（通常为
echo   http://localhost:8080 ，若被占用会自动顺延）。
echo   按 Ctrl + C 可停止服务。
echo ============================================================
echo.

call npm run serve

endlocal
pause
