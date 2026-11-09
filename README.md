# dsh-plugin-local-machine

A DSH (DeepSeek Harness) bundle that adds **Local machine** to the left sidebar: a global panel that shows CPU, memory, and GPU usage as a bar chart, with a manual refresh button.

[中文说明](README.zh.md)

## What it adds

- A sidebar row **Local machine** (本机管理) placed after **Plugins** and **Schedules**, directly above **More**.
- A global panel with:
  - a bar chart of CPU, memory, and GPU utilization (0–100%, latest sample);
  - CPU card: model, logical cores, 1-minute load;
  - memory card: used, total, available, swap used;
  - GPU card: model, VRAM used, status.
- A **Refresh** button that samples again, plus the time of the last sample.
- Simplified Chinese and English copy, host theme tokens for light and dark.

## Requirements

- DSH `>= 0.2.0` (declared as `engines.dsh`).
- Linux for full data, because CPU and memory come from `/proc`.
- GPU numbers need either `nvidia-smi` (NVIDIA) or the amdgpu sysfs counters. When neither is readable the panel still shows the GPU model, with **Driver unavailable** rather than a guessed percentage.

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

A directory install links the checkout, so edits to `client.js` are picked up by the client bundle watcher.

## Usage

Click **Local machine** in the sidebar. The panel samples once when it opens; press **Refresh** to sample again. Leaving the panel unmounts it, so no timer keeps running in the background.

## How each value is measured

| Value | Source |
| --- | --- |
| CPU utilization | Two `/proc/stat` reads about 200 ms apart; the busy delta over the total delta |
| CPU model, cores | `/proc/cpuinfo` (`model name`), `os.cpus().length` |
| 1-minute load | `os.loadavg()[0]` |
| Memory | `/proc/meminfo`: used = `MemTotal` − `MemAvailable`; swap from `SwapTotal`/`SwapFree` |
| GPU, NVIDIA | `nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total` (1.5 s timeout) |
| GPU, AMD | `/sys/class/drm/card*/device/gpu_busy_percent` and `mem_info_vram_used` / `mem_info_vram_total` |

## Host endpoint

The Host half registers one same-origin route behind the connection trust fence:

```text
GET /local-machine/metrics
```

```json
{
  "sampledAt": "2026-11-09T04:24:57.000Z",
  "cpu": { "usage": 3.2, "cores": 28, "model": "Intel(R) Core(TM) i7-14700KF", "load": 1.22 },
  "memory": { "usedBytes": 11194482688, "totalBytes": 67240763392, "availableBytes": 56046280704, "usage": 16.6, "swapUsedBytes": 0, "swapTotalBytes": 2051010560 },
  "gpu": { "available": false, "vendor": "nvidia", "name": "NVIDIA GeForce RTX 4060 Ti", "usage": null, "memoryUsedBytes": null, "memoryTotalBytes": null, "reason": "driver-unavailable" }
}
```

`gpu.reason` is `driver-unavailable` when the model is known but the driver cannot be queried, and `not-detected` when no GPU is found.

## Files

| Path | Role |
| --- | --- |
| `index.js` | Host half: metric sampling and the `/local-machine/metrics` route |
| `client.js` | Client half: the sidebar panel entry and the panel page |
| `cordis.patch.yml` | Bundle patch that inserts the `local-machine` row |
| `locale/*.json` | Plugin Manager title and description per language |
| `icon.svg` | Plugin icon |
| `scripts/make-index.mjs` | Writes `docs/index.json` (plugin market index, format 1) from the manifest and `HEAD` |
| `docs/` | Published plugin index and its icon (GitHub Pages) |

## Publishing a release (maintainer)

```bash
# 1. bump the version in package.json, commit the code
git add -A && git commit -m "feat: ..."
git tag v1.1.0

# 2. regenerate the index (pins the new commit), then commit and push
node scripts/make-index.mjs
git add docs && git commit -m "chore: publish market index"
git push && git push --tags
```

GitHub Pages serves `docs/`, so the index becomes available at
`https://swjybky.github.io/dsh-local-machine/index.json`.

## License

MIT
