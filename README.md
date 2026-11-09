# dsh-plugin-local-machine

A DSH (DeepSeek Harness) bundle that adds **Local machine** to the left sidebar: a full local system dashboard with system information, CPU, memory, GPU, disk, network, temperature, fan, and top-process monitoring. It runs on Linux, macOS, and Windows.

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

The panel never invents a percentage. A missing counter is reported as `—`, **Usage unavailable**, **Driver unavailable**, or **No GPU detected**. Windows process user names are not exposed by the process performance counters, so that column shows **—** on Windows. On Linux and macOS the per-process CPU column is the lifetime average reported by `ps`; Windows uses the instantaneous performance counter. Per-process GPU VRAM is available only for NVIDIA compute processes.

## Host endpoint

The Host half registers one same-origin route behind the connection trust fence:

```text
GET /local-machine/metrics
```

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

Notes on the payload:

- `schemaVersion` is `2`. A payload without it comes from an older Host half, and the client asks for a DSH restart instead of showing blank fields.
- `platform` is Node's `process.platform` (`linux`, `darwin`, or `win32`).
- `cpu.cores` remains the logical thread count for backward compatibility; `cpu.physicalCores` is the physical core count. `cpu.load` is the 1-minute load for compatibility; `cpu.loadAverage` carries all three values.
- `cpu.perCore[].kind` is `p`, `e`, or `null`; `hybrid` is true only when the OS exposes both core classes.
- `gpu.available` means GPU utilization is readable. `gpu.reason` is `driver-unavailable` when the model is known but the driver cannot be queried, `unsupported` when the OS exposes no utilization counter, and `not-detected` when no GPU is found.
- `null` means the platform did not expose that value. `diskIO`, `network`, `processes`, and `fan` can be `null` when the platform has no usable source.
- `sensors[].key` is `cpu`, `gpu`, `nvme`, `board`, or `other`. A GPU temperature reported by `nvidia-smi` is merged into this list, and unclassified ACPI zones use `other` with their raw label.

## Files

| Path | Role |
| --- | --- |
| `index.js` | Host half: the `/local-machine/metrics` route and its admission checks |
| `lib/platform.js` | Host half: cross-platform probes, caching, rate sampling, and snapshot assembly |
| `lib/parsers.js` | Host half: pure parsers for procfs, sysfs, and command output |
| `client.js` | Client half: the sidebar entry and the full dashboard page |
| `cordis.patch.yml` | Bundle patch that inserts the `local-machine` row |
| `locale/*.json` | Plugin Manager title and description per language |
| `icon.svg` | Plugin icon |
| `test/` | Parser fixtures for all three OSes, a live snapshot test, fallback test, and route tests |
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
git tag v2.0.0

# 2. regenerate the index (pins the new commit), then commit and push
node scripts/make-index.mjs
git add docs && git commit -m "chore: publish market index"
git push && git push --tags
```

GitHub Pages serves `docs/`, so the index stays at
`https://swjybky.github.io/dsh-local-machine/index.json`.

## License

MIT
