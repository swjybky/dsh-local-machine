# dsh-plugin-local-machine

一个 DSH（DeepSeek Harness）插件包：在左侧栏新增 **本机管理** 面板，用柱状图显示本机 CPU、内存、GPU 占用，并提供手动刷新按钮。

[English](README.md)

## 它新增了什么

- 左侧栏新增一行 **本机管理**，排在「插件」「定时任务」之后、**「更多」正上方**。
- 一个全局面板，包含：
  - CPU / 内存 / GPU 占用的柱状图（0–100%，显示最近一次采样值）；
  - CPU 卡片：型号、逻辑核心数、1 分钟负载；
  - 内存卡片：已用、总量、可用、交换分区已用；
  - GPU 卡片：型号、显存占用、状态。
- 右上角 **刷新** 按钮，重新采样；标题旁显示上次采样时间。
- 中英文案，配色全部使用宿主主题 token，自动适配浅色 / 深色。

## 环境要求

- DSH `>= 0.2.0`（在 `engines.dsh` 中声明）。
- CPU 和内存数据来自 `/proc`，因此完整数据需要 Linux；其他平台面板仍可打开，但显示「不可用」。
- GPU 数据需要 `nvidia-smi`（NVIDIA）或 amdgpu 的 sysfs 计数器。两者都读不到时，面板仍会显示 GPU 型号，状态显示「驱动不可用」，不会编造百分比。

## 安装

### 从插件索引安装（Discover）

1. 打开 **Plugins** → **Experimental plugins**，打开 **Custom plugin indexes**（bundle `@deepseek-ai/dsh-experimental-plugin-market-bundle`）。
2. 切到 **Discover** 标签，添加下面的索引 URL，然后安装 **本机管理**。

```text
https://swjybky.github.io/dsh-local-machine/index.json
```

### 直接从 Git 安装

```text
plugin_manager install_bundle
  target: git+https://github.com/swjybky/dsh-local-machine.git#<40 位 commit>
```

### 从本地目录安装

```text
plugin_manager install_bundle
  target: /本仓库的绝对路径
```

目录安装是软链接，所以修改 `client.js` 后会被客户端 bundle 监听器自动发现。

## 使用

点击侧边栏的 **本机管理**。面板打开时采样一次，点 **刷新** 重新采样；离开面板即卸载，不会在后台留定时器。

## 每个数值怎么来的

| 数值 | 来源 |
| --- | --- |
| CPU 占用 | 间隔约 200ms 读两次 `/proc/stat`，用忙碌增量除以总增量 |
| CPU 型号、核心数 | `/proc/cpuinfo` 的 `model name`、`os.cpus().length` |
| 1 分钟负载 | `os.loadavg()[0]` |
| 内存 | `/proc/meminfo`：已用 = `MemTotal` − `MemAvailable`；交换分区取 `SwapTotal`/`SwapFree` |
| GPU（NVIDIA） | `nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total`（1.5s 超时） |
| GPU（AMD） | `/sys/class/drm/card*/device/gpu_busy_percent` 与 `mem_info_vram_used` / `mem_info_vram_total` |

## Host 接口

Host 半注册了一个同源路由，受连接信任校验保护：

```text
GET /local-machine/metrics
```

返回示例见英文 README。其中 `gpu.reason` 为 `driver-unavailable`（型号已知但驱动查询不到）或 `not-detected`（未检测到 GPU）。

## 文件说明

| 路径 | 作用 |
| --- | --- |
| `index.js` | Host 半：指标采集与 `/local-machine/metrics` 路由 |
| `client.js` | Client 半：侧边栏入口与面板页面 |
| `cordis.patch.yml` | 插入 `local-machine` 行的 bundle patch |
| `locale/*.json` | 插件管理器中各语言的标题与描述 |
| `icon.svg` | 插件图标 |
| `scripts/make-index.mjs` | 由包信息与 `HEAD` 生成 `docs/index.json`（插件市场索引 format 1） |
| `docs/` | 对外发布的索引和图标（GitHub Pages） |

## 发布新版本（维护者）

```bash
# 1. 改 package.json 的 version，提交代码
git add -A && git commit -m "feat: ..."
git tag v1.1.0

# 2. 重新生成索引（固定到新 commit），再提交推送
node scripts/make-index.mjs
git add docs && git commit -m "chore: publish market index"
git push && git push --tags
```

GitHub Pages 以 `docs/` 为站点根目录，索引地址为
`https://swjybky.github.io/dsh-local-machine/index.json`。

## 许可

MIT
