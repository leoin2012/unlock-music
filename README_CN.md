# Unlock Music 本地架设说明（中文）

本文件记录本项目在 **Windows** 本地从源码架设 Web 服务的完整过程、遇到的问题及解决方案，并提供一键启动脚本。

> 项目用途：在浏览器中解锁加密音乐文件（QQ音乐 / 网易云 / 酷狗 / 酷我 / 虾米 / 咪咕 等），转换为通用的 MP3 / FLAC。请仅用于解锁**你自己购买或下载**的音乐以便个人跨设备播放，勿用于商业或传播用途。

---

## 一、快速启动（日常使用）

WASM 已编译完成、依赖已安装，日常只需双击运行：

```
start-web.bat
```

脚本会启动开发服务器，编译完成后在浏览器打开显示的地址（默认 **http://localhost:8080**，若被占用会自动顺延到 8081 等）。

把加密音乐文件拖入网页即可解锁下载。按 `Ctrl + C` 可停止服务。

---

## 二、环境要求

| 组件 | 版本 | 说明 |
|------|------|------|
| Node.js | 本机 v22（项目原要求 v16） | 高版本需额外设置见下文 |
| npm | 10.x | 随 Node 安装 |
| emscripten | 3.0.0 | 编译 WASM 用，已装在 `build/emsdk/`（仅重编 WASM 时需要） |

---

## 三、本次构建遇到的问题与解决方案

从 `git clone` 后直接构建会失败，依次排除了三层障碍：

### 问题 1：npm 私有依赖已从 registry 下架（DMCA）

`npm ci` 报错 `404 Not Found`，两个私有 scoped 包已被作者从 npm 移除：

- `@unlock-music/joox-crypto`（JOOX / QQ音乐海外版解密）
- `@jixun/kugou-crypto`（酷狗 JS fallback 解密）

**解决**：

1. 从 `package.json` 的 `dependencies` 中删除这两个包。
2. 删除 `package-lock.json`（其中仍锁定了旧版本），改用 `npm install` 重新生成锁文件。
3. 修改源码去掉对这两个包的 `import`：
   - `src/decrypt/joox.ts`：移除 `import jooxFactory`，JOOX 解密改为抛出「本地构建暂不支持」。
   - `src/decrypt/kgm.ts`：移除 `import { decryptKgmByteAtOffsetV2, decryptVprByteAtOffset }`，纯 JS fallback 分支改为抛错。酷狗解密改由 WASM 路径完成（见问题 3），正常可用。

> 影响：**JOOX（`.ofl_en`）格式不支持**；QQ音乐、网易云、酷狗、酷我等主流格式均正常。

### 问题 2：Node 版本过高导致 OpenSSL 报错

项目基于 Vue CLI 4 + Webpack 4，`.nvmrc` 要求 Node v16，而本机为 v22。直接 `npm run serve` 会因新版 OpenSSL 报 `ERR_OSSL_EVP_UNSUPPORTED`。

**解决**：启动前设置环境变量 `NODE_OPTIONS=--openssl-legacy-provider`（已内置到 `start-web.bat`）。

### 问题 3：WASM 模块缺失，需自行编译（核心）

编译报错找不到 `@/QmcWasm/QmcWasmBundle` 与 `@/KgmWasm/KgmWasmBundle`。这两个是 **QQ音乐 / 酷狗解密的核心**，仓库只含 C++ 源码（`.cpp/.hpp/CMakeLists.txt`），需用 emscripten 编译生成，且官方不随源码提供预编译产物。

官方预构建包的分发站点当时全部不可用（Gitea 站 500、Cloudflare 人机验证拦截、Gitee 镜像无 releases），因此改为本地编译。

**解决**：

1. 安装 emscripten 3.0.0 到 `build/emsdk/`：
   ```bash
   git clone --depth 1 https://github.com/emscripten-core/emsdk.git build/emsdk
   cd build/emsdk && ./emsdk install 3.0.0 && ./emsdk activate 3.0.0
   ```
2. 由于 Windows 无 make/ninja，且 Git Bash 下 `emsdk_env.sh` 未能正确注入 PATH，改为**直接用 `emcc.py` 手动编译**（绕过 CMake + make），参数取自各自的 `CMakeLists.txt` 中的 `EMSCRIPTEN_WASM_BUNDLE_FLAGS`（`SINGLE_FILE=1`，把 wasm 内联进 js，适合本地免协议使用）。
   - 生成 `src/QmcWasm/QmcWasmBundle.js`（EXPORT_NAME=`QmcCryptoModule`）
   - 生成 `src/KgmWasm/KgmWasmBundle.js`（EXPORT_NAME=`KgmCryptoModule`）

具体命令已封装到 `build-wasm.bat`，正常情况**无需重复执行**（产物已生成）。

---

## 四、从零完整构建步骤（参考）

若在新机器上重新架设，按顺序执行：

```bash
# 1. 安装依赖（已移除下架的包）
npm install

# 2. 编译 WASM（首次必需，产物已在仓库则可跳过）
#    双击 build-wasm.bat，或参考问题 3 的命令

# 3. 启动服务
#    双击 start-web.bat，或手动执行：
NODE_OPTIONS=--openssl-legacy-provider npm run serve
```

---

## 五、脚本说明

| 脚本 | 作用 |
|------|------|
| `start-web.bat` | 一键启动本地 Web 服务（已设置 `--openssl-legacy-provider`） |
| `build-wasm.bat` | 重新编译两个 WASM 模块（仅在产物丢失或改动 C++ 源码时需要；会自动检测并安装 emscripten 3.0.0） |

---

## 六、支持的格式

- ✅ QQ音乐（`.qmc0/.qmc2/.qmc3/.qmcflac/.qmcogg/.mflac/.mgg/.mgg1/.mggl` 等）
- ✅ 网易云音乐（`.ncm`）
- ✅ 酷狗音乐（`.kgm/.vpr`）
- ✅ 酷我音乐（`.kwm`）
- ✅ 虾米音乐（`.xm`）
- ✅ 咪咕音乐（`.mg3d`）
- ✅ 喜马拉雅（`.x2m/.x3m`）、Moo 音乐、QQ音乐 Tm 格式等
- ⚠️ JOOX / QQ音乐海外版（`.ofl_en`）— **本地构建不支持**（依赖包已下架）
