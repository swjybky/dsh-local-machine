# dsh-plugin-local-machine

一个 DSH（DeepSeek Harness）插件包：在左侧栏新增 **本机管理** 全局面板，集中展示本机系统信息，以及 CPU、内存、GPU、磁盘、网络、温度、风扇和进程的实时状态。支持 Linux、macOS 和 Windows。

[English](README.md)

## 它新增了什么

- 左侧栏新增一行 **本机管理**，排在「插件」「定时任务」之后、**「更多」正上方**。
- 一个全局面板，包含：
  - 顶部状态、上次采样时间、自动识别的当前系统、自动刷新间隔（2 秒 / 5 秒 / 10 秒 / 关闭）和 **刷新** 按钮；
  - 系统信息卡：系统版本、内核/版本号、主机名、架构、桌面环境/外壳、运行时间、开机时间；
  - CPU、内存、GPU、根磁盘四个 KPI 圆环；
  - CPU、内存、GPU 的 60 秒占用趋势；
  - 逻辑核心网格，逐核显示占用；系统暴露性能核/能效核时自动标注 P/E，并显示平均负载；
  - 内存已用、缓存/缓冲、空闲、可用、交换分区（Windows 为页面文件）和内存规格；
  - GPU 利用率、显存、功耗、风扇、驱动、CUDA、核心/显存频率和温度；
  - 磁盘占用与读写速率；网络接口、链路速率、IPv4 地址、累计流量和实时速率；
  - 温度传感器与系统风扇；
  - CPU 占用最高的 8 个进程，包含 PID、用户、CPU 进度条、常驻内存；NVIDIA 环境下还显示进程显存。
- 中英文案，自动适配浅色/深色主题。
- 不需要原生模块、编译步骤、管理员权限，也不在后台保留采样定时器：面板打开时采样一次，之后按所选间隔采样；离开面板即停止，隐藏的标签页跳过自动采样。

> 设计稿里的 **系统** 下拉框用于在三套演示数据之间切换。真实面板始终读取本机，因此该演示控件改为显示自动识别的系统标识，不会展示伪造数据。

## 环境要求

- DSH `>= 0.2.0`（在 `engines.dsh` 中声明）。
- Linux、macOS 或 Windows，无需 `sudo` 或管理员权限。
- Linux 读取 procfs 和 sysfs；macOS 使用系统自带的 `vm_stat`、`sysctl`、`ioreg`、`netstat`、`ifconfig`、`df`、`mount`；Windows 使用 Node 的 `os` 模块和 Windows PowerShell 5.1（`powershell.exe`）的 CIM 查询。
- 可选工具：`nvidia-smi` 用于 NVIDIA 占用率和进程显存；`system_profiler` 用于 macOS 内存规格。读不到某项时，面板显示 **—** 或明确的原因，不会编造百分比。

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

目录安装是软链接，所以修改 `client.js` 后会被客户端 bundle 监听器自动发现；修改 Host 半（`index.js`、`lib/`）后需要重启 DSH 才会加载新的路由代码。

## 使用

点击侧边栏的 **本机管理**。面板打开时采样一次，之后按所选间隔自动刷新；点 **刷新** 立即采样。离开面板即卸载并停止定时器。趋势图由面板打开期间采集到的样本构成，因此会在最初一分钟内逐步填满，不会显示虚构的历史数据。

当客户端比正在运行的 Host 半更新时（例如刚更新插件），面板会显示醒目的黄色 **重启 DSH** 提示，而不是让字段静默显示为空。Host 采集器只在 DSH 启动时加载，单纯刷新页面无法加载它。

## 每个数值怎么来的

| 数值 | Linux | macOS | Windows |
| --- | --- | --- | --- |
| 系统版本、内核/版本号 | `/etc/os-release`、`uname` | `sw_vers`、Darwin 内核版本 | `Win32_OperatingSystem` |
| 主机名、架构、运行时间、开机时间 | `os.hostname()`、`os.arch()`、`os.uptime()` | 同上 | 同上 |
| 桌面环境 / 外壳 | `XDG_CURRENT_DESKTOP`、`XDG_SESSION_TYPE` | `Aqua` | `Explorer` |
| CPU 占用 | 间隔约 200 ms 读两次 `/proc/stat`；读不到时回退到 `os.cpus()` 增量 | `os.cpus()` 增量 | `os.cpus()` 增量 |
| 逐核占用 | `/proc/stat` 的每个 CPU 行 | `os.cpus()` 每个核心的增量 | `os.cpus()` 每个核心的增量 |
| 性能核 / 能效核 | 读取 sysfs 的 SMT 兄弟线程数：有 SMT 兄弟的是 P 核，单线程的是 E 核 | `hw.perflevel0/1` sysctl | 系统不暴露，统一显示为逻辑核心 |
| CPU 型号、基准频率 | `os.cpus()`、`cpufreq/base_frequency` | `os.cpus()`、`hw.cpufrequency` | `Win32_Processor` |
| 1/5/15 分钟负载 | `os.loadavg()` | `os.loadavg()` | 不提供（提示中省略） |
| 内存 | `/proc/meminfo`：已用 = `MemTotal` − `MemAvailable`；缓存 = 可用 − 空闲；交换分区取 `SwapTotal`/`SwapFree` | `vm_stat` + `hw.memsize`；空闲 = free 页，缓存 = inactive + speculative；交换取 `sysctl vm.swapusage` | `os.totalmem()` / `os.freemem()`；页面文件取 `Win32_PageFileUsage` |
| 内存规格 | 普通权限读不到，显示 **—** | `system_profiler SPMemoryDataType` | `Win32_PhysicalMemory` |
| GPU（NVIDIA） | `nvidia-smi --query-gpu=...` 读取占用、显存、功耗、风扇、温度、驱动和频率；CUDA 版本从完整报告解析 | 安装时同样调用 | 安装时同样调用 |
| GPU（AMD） | amdgpu sysfs：`gpu_busy_percent`、显存计数、hwmon 温度/风扇/功耗、`pp_dpm_*` 频率 | `ioreg` IOAccelerator 的 `Device Utilization %`（系统暴露时） | 仅通过 `Win32_VideoController` 读取型号和驱动 |
| GPU（Intel/其他） | DRM/sysfs 读取型号；系统暴露 `gt_busy_percent` 时读取占用 | `ioreg` 读取型号；系统暴露时读取占用 | 仅读取型号和驱动 |
| 磁盘占用 | `/proc/mounts` + `statfs`，本地文件系统按设备去重，最多 4 个 | `df -kP` + `mount`，展示 macOS 数据卷和外接卷 | `Win32_LogicalDisk`（固定磁盘） |
| 磁盘读写速率 | `/proc/diskstats` 的物理磁盘增量 | `ioreg` IOBlockStorageDriver 字节计数增量 | `Win32_PerfFormattedData_PerfDisk_PhysicalDisk` |
| 网络接口、IP | `/proc/net/dev`、`/proc/net/route`、`os.networkInterfaces()`、sysfs 链路速率 | `netstat -ibn`、`ifconfig` 速率、`os.networkInterfaces()` | `Get-NetAdapter` + `Get-NetAdapterStatistics`；perf 计数器作为回退 |
| 网络速率 | 累计计数增量 | 累计计数增量 | 适配器统计的累计计数增量 |
| 温度与风扇 | hwmon（`coretemp`、`nvme`、`acpitz`、`amdgpu` 等） | 无无需提权的系统传感器接口；安装 `nvidia-smi` 时显示 NVIDIA GPU 温度 | `MSAcpi_ThermalZoneTemperature` 和 `Win32_Fan`，外加 NVIDIA GPU 温度 |
| 进程 Top 8 | `ps` 按 CPU 排序；线程总数来自 `/proc/loadavg` | `ps` 按 CPU 排序；线程数取 `sysctl kern.num_threads` | `Win32_PerfFormattedData_PerfProc_Process` |
| 进程 GPU 显存 | 检测到 NVIDIA 时调用 `nvidia-smi --query-compute-apps` | 同上 | 同上 |

面板不会编造百分比：读不到的计数器显示 **—**、**占用不可读**、**驱动不可用** 或 **未检测到 GPU**。Windows 的进程性能计数器不提供用户名，因此该列在 Windows 上显示 **—**。Linux 和 macOS 的进程 CPU 列是 `ps` 报告的生命周期平均值，Windows 使用瞬时性能计数器；进程 GPU 显存仅对 NVIDIA 计算进程可用。

## Host 接口

Host 半注册了一个同源路由，受连接信任校验保护：

```text
GET /local-machine/metrics
```

返回结构（省略部分数组内容，字段含义与英文 README 的完整示例一致）：

```json
{
  "schemaVersion": 2,
  "sampledAt": "2026-11-09T06:58:02.515Z",
  "platform": "linux",
  "os": {
    "name": "Linux",
    "release": "Ubuntu 26.04.1 LTS",
    "kernel": "7.0.0-42-generic",
    "version": null,
    "hostname": "workstation-01",
    "arch": "x86_64",
    "desktop": "GNOME · Wayland",
    "uptimeSeconds": 13663,
    "bootTime": "2026-11-09T03:05:00.306Z"
  },
  "cpu": {
    "usage": 5.7,
    "cores": 28,
    "threads": 28,
    "physicalCores": 20,
    "performanceCores": 8,
    "efficiencyCores": 12,
    "hybrid": true,
    "model": "Intel(R) Core(TM) i7-14700KF",
    "frequencyMhz": 3400,
    "baseFrequencyMhz": 3400,
    "load": 1.01,
    "loadAverage": [1.01, 1.3, 1.33],
    "perCore": [{ "index": 0, "usage": 3.2, "kind": "p" }]
  },
  "memory": {
    "totalBytes": 67240763392,
    "usedBytes": 13982400512,
    "availableBytes": 53258362880,
    "freeBytes": 8789512192,
    "cachedBytes": 44468850688,
    "usage": 20.8,
    "swapTotalBytes": 2051010560,
    "swapUsedBytes": 0,
    "spec": null
  },
  "gpu": {
    "available": true,
    "vendor": "nvidia",
    "name": "NVIDIA GeForce RTX 4060 Ti",
    "usage": 15,
    "memoryUsedBytes": 796917760,
    "memoryTotalBytes": 17179869184,
    "powerWatts": 18,
    "powerLimitWatts": 165,
    "fanPercent": 0,
    "fanRpm": null,
    "temperatureCelsius": 41,
    "driverVersion": "560.35.03",
    "cudaVersion": "12.6",
    "coreClockMhz": 2535,
    "memoryClockMhz": 9001,
    "reason": null
  },
  "disks": [
    {
      "device": "vgubuntu-root",
      "mount": "/",
      "label": null,
      "fs": "ext4",
      "totalBytes": 980799373312,
      "usedBytes": 709475008512,
      "availableBytes": 221427040256,
      "usage": 72.3
    }
  ],
  "diskIO": { "readBytesPerSecond": 13002342, "writeBytesPerSecond": 3250585 },
  "network": {
    "interface": "enp4s0",
    "ipv4": "10.10.12.86",
    "linkSpeedMbps": 1000,
    "downBytesPerSecond": 2516582,
    "upBytesPerSecond": 319488,
    "receivedBytes": 881750404,
    "transmittedBytes": 364600435
  },
  "sensors": [
    { "key": "cpu", "label": "Package id 0", "celsius": 46 },
    { "key": "gpu", "label": null, "celsius": 41 },
    { "key": "nvme", "label": "Composite", "celsius": 38 },
    { "key": "board", "label": null, "celsius": 34 }
  ],
  "fan": { "key": "fan", "label": null, "rpm": 1120, "maxRpm": 3000 },
  "processes": {
    "total": 412,
    "threads": 3186,
    "top": [
      {
        "name": "firefox",
        "pid": 4821,
        "user": "workstation",
        "cpuPercent": 3.2,
        "memoryBytes": 2040109465,
        "gpuMemoryBytes": 222298112
      }
    ]
  }
}
```

字段说明：

- `schemaVersion` 为 `2`。缺少该字段的返回来自旧版 Host，客户端会提示重启 DSH，而不是静默显示空字段。
- `platform` 是 Node 的 `process.platform`（`linux`、`darwin`、`win32`）。
- `cpu.cores` 仍为逻辑线程数，保持旧字段兼容；物理核心数在 `cpu.physicalCores`。`cpu.load` 仍是 1 分钟负载；`cpu.loadAverage` 提供三个值。
- `cpu.perCore[].kind` 为 `p`、`e` 或 `null`；只有系统同时暴露两类核心时 `hybrid` 才为 true。
- `gpu.available` 表示 GPU 占用是否可读。`gpu.reason` 为 `driver-unavailable`（型号已知但驱动查询不到）、`unsupported`（系统不提供占用）或 `not-detected`（未检测到 GPU）。
- `null` 表示该系统没有提供该项。`diskIO`、`network`、`processes`、`fan` 在系统没有可用数据源时可能为 `null`。
- `sensors[].key` 为 `cpu`、`gpu`、`nvme`、`board` 或 `other`；`nvidia-smi` 读取到的 GPU 温度会合并进该数组，无法归类的 ACPI 温度区使用 `other` 并保留原始标签。

## 文件说明

| 路径 | 作用 |
| --- | --- |
| `index.js` | Host 半：`/local-machine/metrics` 路由与连接校验 |
| `lib/platform.js` | Host 半：跨平台探测、缓存、速率采样与快照组装 |
| `lib/parsers.js` | Host 半：procfs、sysfs 和命令输出的纯解析器 |
| `client.js` | Client 半：侧边栏入口与完整面板页面 |
| `cordis.patch.yml` | 插入 `local-machine` 行的 bundle patch |
| `locale/*.json` | 插件管理器中各语言的标题与描述 |
| `icon.svg` | 插件图标 |
| `test/` | 三系统解析夹具、本机实时快照、回退与路由测试 |
| `scripts/make-index.mjs` | 由包信息与 `HEAD` 生成 `docs/index.json`（插件市场索引 format 1） |
| `docs/` | 对外发布的索引和图标（GitHub Pages） |

## 开发

```bash
npm test
```

解析夹具在任何系统上都能覆盖 Linux / macOS / Windows 的输出格式；实时快照和路由测试读取当前机器，因此发布前建议在每个系统上各跑一次 `npm test`。

客户端是纯 React，没有构建步骤：`client.js` 通过 DSH 模块加载器注册工厂，Host 负责下发。修改 `client.js` 后，打开的面板会通过客户端 bundle 监听器更新；修改 `index.js` 或 `lib/` 后需要重启 DSH。

## 发布新版本（维护者）

```bash
# 1. 改 package.json 的 version，提交代码
git add -A && git commit -m "feat: ..."
git tag v2.0.0

# 2. 重新生成索引（固定到新 commit），再提交推送
node scripts/make-index.mjs
git add docs && git commit -m "chore: publish market index"
git push && git push --tags
```

GitHub Pages 以 `docs/` 为站点根目录，索引地址为
`https://swjybky.github.io/dsh-local-machine/index.json`。

## 许可

MIT
