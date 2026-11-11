# dsh-plugin-local-machine

A DSH (DeepSeek Harness) bundle that adds **Local machine** to the left sidebar: a full local system dashboard with system information, CPU, memory, GPU, disk, network, temperature, fan, and top-process monitoring, plus a finer-grained view of the DSH processes and sessions running on this machine. It runs on Linux, macOS, and Windows.

[中文说明](README.zh.md)

## What it adds

- A sidebar row **Local machine** (本机管理) placed after **Plugins** and **Schedules**, directly above **More**.
- A global panel with:
  - a header showing the live collection state, last sample time, the automatically detected operating system, an auto-refresh interval (2 s, 5 s, 10 s, or off), and a manual **Refresh** button;
  - a system identity card: OS release, kernel/version, hostname, architecture, desktop/shell, uptime, and boot time;
  - KPI rings for CPU, memory, GPU, and the root disk;
  - a 60-second trend chart for CPU, memory, and GPU;
  - a logical-core grid with per-core utilization, Intel/Apple performance/efficiency core labels when the OS exposes them, and the load average;
  - memory used/cache/free, available memory, swap (or the Windows page file), and the memory-module description when the OS exposes it;
  - GPU utilization, VRAM, power, fan, driver, CUDA, core/memory clocks, and temperature;
  - disk usage plus read/write throughput, network link speed, IPv4 address, cumulative traffic, and transfer rates;
  - temperature sensors and one system fan;
  - the top 8 processes by CPU with PID, user, a CPU bar, resident memory, and NVIDIA compute VRAM when available.
- Three DSH-focused cards, each full width:
  - **DSH processes**: the harness process tree (main, GPU, renderer, Host, utility, tool subprocess, terminal) with role badges, per-process CPU, resident memory, swap, thread count, disk read/write rate, file descriptors, socket count, and established remote peers;
  - **DSH sessions**: every session the Host knows about, with title, cwd, live/idle state, event count, token totals, context-window pressure, turn and step counts, model and tool time, log size and growth, and the processes and threads attributed to that session;
  - **Host runtime**: process uptime, Node/Electron/V8 versions, JS heap usage, event-loop delay, active handles by type, resource-usage counters, and the busiest threads of the DSH process.
- Simplified Chinese and English copy, with light and dark themes.
- No native module, build step, elevated permission, or background sampling timer: the panel samples when it mounts, on refresh, and on the chosen interval while mounted. Hidden tabs skip automatic samples.

> The design mock used a **System** dropdown to switch between demo data for three operating systems. The real panel always reads this machine, so that demo control is replaced by a system chip showing the detected OS; all data stays real. The panel does not show fabricated values.

## Requirements

- DSH `>= 0.2.0` (declared as `engines.dsh`).
- Linux, macOS, or Windows. No `sudo` or administrator rights are required.
- Linux reads procfs and sysfs. macOS uses system tools such as `vm_stat`, `sysctl`, `ioreg`, `netstat`, `ifconfig`, `df`, and `mount`. Windows uses Node's `os` module plus Windows PowerShell 5.1 (`powershell.exe`) CIM queries.
- Optional tools: `nvidia-smi` for NVIDIA utilization and per-process VRAM; `system_profiler` for macOS memory modules. When a counter is unavailable the panel shows **—** or an explicit reason instead of guessing.

## Install

### From a plugin index (Discover)

1. Open **Plugins** → **Experimental plugins** and switch on **Custom plugin indexes** (bundle `@deepseek-ai/dsh-experimental-plugin-market-bundle`).
2. Open the **Discover** tab, add the index URL below, then install **Local machine**.

```text
https://swjybky.github.io/dsh-local-machine/index.json
```

### From Git

```text
plugin_manager install_bundle
  target: git+https://github.com/swjybky/dsh-local-machine.git#<40-character-commit>
```

### From a local checkout

```text
plugin_manager install_bundle
  target: /absolute/path/to/this/folder
```

A directory install links the checkout, so edits to `client.js` are picked up by the client bundle watcher. Changes to the Host half (`index.js`, `lib/`) need a DSH restart before the new route code is loaded.

## Usage

Click **Local machine** in the sidebar. The panel samples once when it opens, then follows the selected auto-refresh interval; press **Refresh** to sample immediately. Leaving the panel unmounts it and stops its timer. The trend chart is built from samples collected while the panel is open, so it fills over the first minute rather than showing invented history.

When the client is newer than the running Host half (for example after updating the plugin), the panel shows an amber **Restart DSH** banner instead of silently blank fields. The Host collector is loaded only at DSH startup, so a page refresh alone cannot load it.

## How each value is measured

| Value | Linux | macOS | Windows |
| --- | --- | --- | --- |
| OS release, kernel/version | `/etc/os-release`, `uname` | `sw_vers`, Darwin kernel release | `Win32_OperatingSystem` |
| Hostname, architecture, uptime, boot time | `os.hostname()`, `os.arch()`, `os.uptime()` | Same | Same |
| Desktop / shell | `XDG_CURRENT_DESKTOP`, `XDG_SESSION_TYPE` | `Aqua` | `Explorer` |
| CPU utilization | Two `/proc/stat` reads about 200 ms apart; falls back to `os.cpus()` deltas | `os.cpus()` deltas | `os.cpus()` deltas |
| Per-core utilization | Per-CPU `/proc/stat` lines | Per-core `os.cpus()` deltas | Per-core `os.cpus()` deltas |
| Performance/efficiency cores | SMT sibling counts in sysfs: SMT cores are P, single-threaded cores are E | `hw.perflevel0/1` sysctls | Not exposed; all cores are shown as logical |
| CPU model, base clock | `os.cpus()`, `cpufreq/base_frequency` | `os.cpus()`, `hw.cpufrequency` | `Win32_Processor` |
| 1/5/15-minute load | `os.loadavg()` | `os.loadavg()` | Not exposed (omitted from the hint) |
| Memory | `/proc/meminfo`: used = `MemTotal` − `MemAvailable`; cache = available − free; swap from `SwapTotal`/`SwapFree` | `vm_stat` + `hw.memsize`; free = free pages, cache = inactive + speculative; swap from `sysctl vm.swapusage` | `os.totalmem()` / `os.freemem()`; page file from `Win32_PageFileUsage` |
| Memory modules | Not exposed to an unprivileged process; shows **—** | `system_profiler SPMemoryDataType` | `Win32_PhysicalMemory` |
| GPU (NVIDIA) | `nvidia-smi --query-gpu=...` (utilization, VRAM, power, fan, temperature, driver, clocks); CUDA version from the plain report | Same when installed | Same when installed |
| GPU (AMD) | amdgpu sysfs: `gpu_busy_percent`, VRAM counters, hwmon temperature/fan/power, `pp_dpm_*` clocks | `ioreg` IOAccelerator `Device Utilization %` when exposed | Model and driver only through `Win32_VideoController` |
| GPU (Intel/other) | DRM/sysfs model, plus `gt_busy_percent` when exposed; otherwise model only | `ioreg` model; utilization when exposed | Model and driver only |
| Disk usage | `/proc/mounts` + `statfs`, local filesystems deduplicated by device and capped at four | `df -kP` + `mount`; the macOS data volume and external volumes | `Win32_LogicalDisk` (fixed drives) |
| Disk throughput | `/proc/diskstats` deltas across whole physical disks | `ioreg` IOBlockStorageDriver byte counters | `Win32_PerfFormattedData_PerfDisk_PhysicalDisk` |
| Network interface, IP | `/proc/net/dev`, `/proc/net/route`, `os.networkInterfaces()`, sysfs link speed | `netstat -ibn`, `ifconfig` media speed, `os.networkInterfaces()` | `Get-NetAdapter` + `Get-NetAdapterStatistics`; perf counters as a fallback |
| Network rates | Cumulative counter deltas | Cumulative counter deltas | Cumulative counter deltas from adapter statistics |
| Temperatures and fan | hwmon (`coretemp`, `nvme`, `acpitz`, `amdgpu`, …) | No unprivileged system sensor API; NVIDIA GPU temperature appears only when `nvidia-smi` is available | `MSAcpi_ThermalZoneTemperature` and `Win32_Fan`, plus NVIDIA GPU temperature |
| Top processes | `ps` by CPU, plus total threads from `/proc/loadavg` | `ps` by CPU; thread count from `sysctl kern.num_threads` | `Win32_PerfFormattedData_PerfProc_Process` |
| Process GPU VRAM | `nvidia-smi --query-compute-apps` when an NVIDIA GPU is reported | Same | Same |
| DSH process tree | `ps -A -ww -o pid=,ppid=,user=,pcpu=,rss=,nlwp=,etime=,stat=,comm=,args=` filtered to the tree rooted at the DSH main process (or the `ARGV0` process) | Same, without `nlwp` (macOS `ps` has no such column), so thread counts come from `/proc` only on Linux | Windows PowerShell `Get-CimInstance Win32_Process` with `ParentProcessId`, `WorkingSetSize`, `ThreadCount`, and `CommandLine` |
| DSH process role | `classifyDshRole` matches argv: Electron `--type=renderer/gpu-process/utility`, `dsh-host/lib`, `app.asar.unpacked/dsh/lib`, and tool/terminal subprocess markers | Same | Same |
| Per-process CPU, memory, swap | `ps` `pcpu`/`rss`, plus `/proc/<pid>/status` `VmRSS`/`VmSwap` for the tree members | `ps` only; swap and RSS come from `ps` | `Win32_Process` `UserModeTime` deltas and `WorkingSetSize` |
| Per-process disk I/O, file descriptors, sockets | `/proc/<pid>/io` (`rchar`/`wchar`/`syscr`/`syscw`), `readlink /proc/<pid>/fd`, and `socket:[inode]` mapped through `/proc/<pid>/net/tcp` and `tcp6` for established peers | Not exposed; those columns show **—** | Not exposed per process; those columns show **—** |
| Host JS heap, event-loop delay, handles | `process.memoryUsage()`, `perf_hooks.monitorEventLoopDelay`, `process._getActiveHandles()` and `getActiveResourcesInfo()` | Same | Same |
| Busiest threads | `/proc/self/task/<tid>/stat` (utime+stime ticks, state, name), with `CLK_TCK` from `getconf CLK_TCK` (default 100) | Not exposed; the card says so instead of showing zeros | Not exposed; the card says so instead of showing zeros |
| Session list, tokens, context pressure, turns/steps | `ctx.sessionProjections.snapshot(session).values` (`title`, `tokenUsage`, `contextPressure`, `sessionStats`), plus `persistence.stat(sessionId)` for log bytes and event count | Same | Same |
| Session hardware attribution | `DSH_SESSION_ID` in `/proc/<pid>/environ` for tree members, which tool and terminal subprocesses inherit; the marker is authoritative | Falls back to a cwd substring match against the session working directory (labelled **by working directory** in the UI) | Same fallback as macOS |

The panel never invents a percentage. A missing counter is reported as `—`, **Usage unavailable**, **Driver unavailable**, or **No GPU detected**. Windows process user names are not exposed by the process performance counters, so that column shows **—** on Windows. On Linux and macOS the per-process CPU column is the lifetime average reported by `ps`; Windows uses the instantaneous performance counter. Per-process GPU VRAM is available only for NVIDIA compute processes.

DSH usage that lives inside one Node process cannot be split per conversation: the V8 heap and the event loop are shared by every session in that process. The **DSH sessions** card therefore reports session-level tokens, context pressure, timing, and log size — real Host metrics — and keeps hardware figures explicitly on the process side. A session shows `0` processes only when no child process can be attributed to it; the attribution basis is printed on the card, so a heuristic match is never presented as exact. When no harness process is found, `harness.available` is `false` with `reason = "not-detected"` and the cards say so instead of rendering empty rows.

## Host endpoint

The Host half registers one same-origin route behind the connection trust fence:

```text
GET /local-machine/metrics
```

```json
{
  "schemaVersion": 3,
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
  },
  "harness": {
    "available": true,
    "reason": null,
    "reasonDetail": null,
    "sampledAt": "2026-11-09T06:58:02.515Z",
    "pid": 4001,
    "attribution": "environment",
    "root": { "pid": 4001, "name": "dsh", "role": "main", "command": "dsh" },
    "host": {
      "pid": 4102,
      "name": "dsh-host",
      "uptimeSeconds": 8123,
      "versions": { "node": "22.11.0", "electron": null, "v8": "12.4" },
      "heap": { "usedBytes": 148373504, "totalBytes": 268435456, "rssBytes": 412000256, "externalBytes": 24379392, "usage": 55.3 },
      "eventLoop": { "meanMs": 1.8, "p99Ms": 12.4, "maxMs": 48.2, "samples": 46 },
      "handles": { "active": 37, "byType": { "TCPSocketWrap": 12, "Timeout": 4 } },
      "resourceUsage": {
        "maxRssBytes": 445644800,
        "voluntaryContextSwitches": 18244,
        "involuntaryContextSwitches": 312,
        "fsReads": 9712,
        "fsWrites": 2411,
        "ipcSent": 82,
        "ipcReceived": 91
      },
      "threadPoolSize": 4,
      "threads": {
        "available": true,
        "count": 24,
        "top": [{ "tid": 4110, "name": "dsh-host", "state": "running", "cpuPercent": 3.4 }]
      }
    },
    "processes": [
      {
        "pid": 4001,
        "ppid": 1,
        "role": "main",
        "name": "dsh",
        "command": "dsh",
        "cpuPercent": 1.6,
        "memoryBytes": 268435456,
        "swapBytes": 0,
        "threads": 32,
        "uptimeSeconds": 8123,
        "state": "sleeping",
        "sessionId": null,
        "isHost": false,
        "readBytesPerSecond": null,
        "writeBytesPerSecond": null,
        "fileDescriptors": 84,
        "socketCount": 16,
        "voluntaryContextSwitches": 9104,
        "involuntaryContextSwitches": 88,
        "peers": [{ "protocol": "tcp", "remoteHost": "127.0.0.1", "remotePort": 37487, "localPort": 51204 }],
        "gpuMemoryBytes": null
      }
    ],
    "totals": { "processCount": 6, "cpuPercent": 7.9, "memoryBytes": 1073741824, "threads": 156, "readBytesPerSecond": 204800, "writeBytesPerSecond": 40960 },
    "sessions": [
      {
        "sessionId": "session-4b91e77d",
        "title": "Add hardware monitoring",
        "cwd": "/home/workstation/project",
        "running": true,
        "live": true,
        "events": 412,
        "tokens": { "inputTokens": 214000, "outputTokens": 18200, "cacheReadTokens": 198000, "cacheWriteTokens": 42000, "totalTokens": 472200 },
        "context": { "usedTokens": 118400, "projectedTokens": 120100, "windowTokens": 200000, "usage": 59.2 },
        "stats": { "turns": 18, "steps": 64, "llmMs": 412000, "toolMs": 128000, "ttftMs": 640, "ttftSteps": 61, "decodeMs": 208000, "decodeTokens": 18200 },
        "logBytes": 4194304,
        "logBytesPerSecond": 0,
        "processCount": 1,
        "threads": 1,
        "cpuPercent": 0.4,
        "memoryBytes": 62914560,
        "vramBytes": null,
        "swapBytes": 0,
        "readBytesPerSecond": 0,
        "writeBytesPerSecond": 0,
        "fileDescriptors": 12,
        "socketCount": 2,
        "pids": [5180]
      }
    ]
  }
}
```

Notes on the payload:

- `schemaVersion` is `3`. A payload without it comes from an older Host half, and the client asks for a DSH restart instead of showing blank fields. Version `3` adds the `harness` block; every earlier field keeps its shape.
- `platform` is Node's `process.platform` (`linux`, `darwin`, or `win32`).
- `cpu.cores` remains the logical thread count for backward compatibility; `cpu.physicalCores` is the physical core count. `cpu.load` is the 1-minute load for compatibility; `cpu.loadAverage` carries all three values.
- `cpu.perCore[].kind` is `p`, `e`, or `null`; `hybrid` is true only when the OS exposes both core classes.
- `gpu.available` means GPU utilization is readable. `gpu.reason` is `driver-unavailable` when the model is known but the driver cannot be queried, `unsupported` when the OS exposes no utilization counter, and `not-detected` when no GPU is found.
- `null` means the platform did not expose that value. `diskIO`, `network`, `processes`, and `fan` can be `null` when the platform has no usable source.
- `sensors[].key` is `cpu`, `gpu`, `nvme`, `board`, or `other`. A GPU temperature reported by `nvidia-smi` is merged into this list, and unclassified ACPI zones use `other` with their raw label.
- `harness.available` is `false` with `reason = "not-detected"` when the harness process tree cannot be found; `processes` is then `[]` while `host` still describes the current process. `harness.attribution` is `environment` when `DSH_SESSION_ID` decided the assignment and `heuristic` when the cwd fallback did.
- `harness.host.threads.available` is `false` on macOS and Windows, where per-thread CPU is not exposed to an unprivileged process.
- `harness.sessions[].context` is `null` until the Host has recorded token usage for that session, and the card then shows **No usage recorded**.

## Files

| Path | Role |
| --- | --- |
| `index.js` | Host half: the `/local-machine/metrics` route and its admission checks |
| `lib/platform.js` | Host half: cross-platform probes, caching, rate sampling, and snapshot assembly |
| `lib/parsers.js` | Host half: pure parsers for procfs, sysfs, and command output |
| `lib/harness.js` | Host half: the DSH process tree, per-thread and per-session probes, Host runtime metrics, and session attribution |
| `client.js` | Client half: the sidebar entry and the full dashboard page |
| `cordis.patch.yml` | Bundle patch that inserts the `local-machine` row |
| `locale/*.json` | Plugin Manager title and description per language |
| `icon.svg` | Plugin icon |
| `test/` | Parser fixtures for all three OSes, harness parser fixtures, a live snapshot test, fallback test, and route tests |
| `scripts/make-index.mjs` | Writes `docs/index.json` (plugin market index, format 1) from the manifest and `HEAD` |
| `docs/` | Published plugin index and its icon (GitHub Pages) |

## Development

```bash
npm test
```

The fixtures exercise the Linux, macOS, and Windows output shapes on any machine. The live snapshot and route tests read the machine running the suite, so run `npm test` once on each OS before a release.

The client is plain React with no build step: `client.js` registers a factory with the DSH module loader, and the Host serves it. Edits to `client.js` reach an open page through the client bundle watcher; changes to `index.js` or `lib/` need a DSH restart.

## Publishing a release (maintainer)

```bash
# 1. bump the version in package.json, commit the code
git add -A && git commit -m "feat: ..."
git tag v2.1.0

# 2. regenerate the index (pins the new commit), then commit and push
node scripts/make-index.mjs
git add docs && git commit -m "chore: publish market index"
git push && git push --tags
```

GitHub Pages serves `docs/`, so the index stays at
`https://swjybky.github.io/dsh-local-machine/index.json`.

## License

MIT
