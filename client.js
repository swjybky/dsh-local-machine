window.__ModuleLoader__.load({
  id: 'dsh-plugin-local-machine',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this panel. */
    const NS = 'local-machine';
    /** Main-panel key; the sidebar row and the center page share it. */
    const PANEL_ID = 'local-machine';
    /**
     * Newest snapshot schema this client understands.
     * The DSH half is loaded once at startup, so a client that needs a newer
     * schema must ask for a restart instead of rendering fields the running
     * collector never sends.
     */
    const REQUIRED_SCHEMA = 3;

    /** Simplified Chinese copy. */
    const zh = {
      panel: '本机管理',
      title: '本机管理',
      subtitle: '查看本机系统信息与 CPU、内存、GPU、磁盘、网络的实时占用',
      refresh: '刷新',
      refreshing: '刷新中…',
      updated: '上次刷新 {time}',
      never: '尚未刷新',
      error: '读取失败：{message}',
      'legacy.title': '需要重启 DSH 才能显示这些卡片',
      'legacy.body': '客户端已更新，但正在运行的 Host 采集器仍是旧版本，因此没有下发 DSH 进程、线程和会话数据。完全退出并重新启动 DSH 后才会加载新的 Host 代码；刷新页面不够。',
      'legacy.release': '重启 DSH 后显示系统信息',
      'status.collecting': '正在采集',
      'status.paused': '已暂停',
      'status.error': '读取失败',
      system: '系统',
      autoRefresh: '自动刷新',
      every2: '每 2 秒',
      every5: '每 5 秒',
      every10: '每 10 秒',
      off: '关闭',
      'os.detected': '已自动识别本机系统',
      'os.operatingSystem': '操作系统',
      'os.kernel': '内核',
      'os.version': '版本号',
      'os.hostname': '主机名',
      'os.computerName': '计算机名',
      'os.arch': '架构',
      'os.desktop': '桌面环境',
      'os.desktopShort': '桌面',
      'os.shell': '外壳',
      'os.explorer': 'Windows 资源管理器',
      'os.uptime': '运行时间',
      'os.boot': '开机时间',
      'os.unknown': '未知系统',
      'uptime.days': '{days} 天 {hours} 小时 {minutes} 分',
      'uptime.hours': '{hours} 小时 {minutes} 分',
      'uptime.minutes': '{minutes} 分',
      'chart.title': '占用趋势',
      'chart.last60': '最近 60 秒',
      'chart.now': '现在',
      'chart.empty': '正在采集趋势数据…',
      cpu: 'CPU',
      memory: '内存',
      gpu: 'GPU',
      disk: '磁盘',
      network: '网络',
      'cpu.threads': '{count} 线程',
      'cpu.load1': '1 分钟负载 {value}',
      'cores.title': '逻辑核心占用',
      'cores.summary': '{threads} 线程',
      'cores.hybrid': '{p}P + {e}E',
      'cores.performance': '性能核 P',
      'cores.efficiency': '能效核 E',
      'cores.logical': '逻辑核心',
      'cores.load': '平均负载 {values}',
      'memory.title': '内存',
      'memory.used': '已用',
      'memory.cache': '缓存 / 缓冲',
      'memory.free': '空闲',
      'memory.total': '内存总量',
      'memory.available': '可用内存',
      'memory.availableShort': '可用 {value}',
      'memory.swap': '交换分区已用',
      'memory.swapFile': '交换文件已用',
      'memory.pagefile': '页面文件已用',
      'memory.swapOff': '未启用',
      'memory.spec': '内存规格',
      'gpu.title': 'GPU',
      'gpu.utilization': 'GPU 利用率',
      'gpu.vram': '显存',
      'gpu.power': '功耗',
      'gpu.fan': '风扇',
      'gpu.driver': '驱动版本',
      'gpu.cuda': 'CUDA 版本',
      'gpu.clocks': '核心 / 显存频率',
      'gpu.temp': '温度',
      'gpu.none': '未检测到 GPU',
      'gpu.unsupported': '占用不可读',
      'gpu.driverUnavailable': '驱动不可用',
      'gpu.vramLine': '显存 {value}',
      'gpu.vramValue': '{used} / {total}',
      'gpu.powerValue': '{power} W / {limit} W',
      'gpu.powerShort': '{power} W',
      'gpu.clockValue': '{core} MHz / {memory} MHz',
      'gpu.fanRpm': '{rpm} rpm',
      'disk.title': '磁盘',
      'disk.io': '读 {read} · 写 {write}',
      'disk.ioUnavailable': '读写速率不可用',
      'disk.empty': '未发现磁盘',
      'disk.mountUsed': '{mount} 已用 {used}',
      'disk.totalValue': '总容量 {total}',
      'net.title': '网络',
      'net.download': '下载',
      'net.upload': '上传',
      'net.ipv4': 'IPv4 地址',
      'net.received': '本次累计接收',
      'net.sent': '本次累计发送',
      'net.empty': '未发现网络接口',
      'sensors.title': '温度与风扇',
      'sensors.normal': '一切正常',
      'sensors.hot': '温度偏高',
      'sensors.unavailable': '读取不可用',
      'sensors.empty': '此系统未提供温度传感器',
      'sensors.cpu': 'CPU 封装',
      'sensors.gpu': 'GPU 核心',
      'sensors.nvme': 'NVMe SSD',
      'sensors.board': '主板',
      'sensors.fan': '风扇',
      'sensors.other': '温度区',
      'proc.title': '进程 Top 8',
      'proc.name': '进程',
      'proc.pid': 'PID',
      'proc.user': '用户',
      'proc.cpu': 'CPU',
      'proc.mem': '内存',
      'proc.vram': 'GPU 显存',
      'proc.summary': '共 {processes} 个进程 · {threads} 个线程 · 按 CPU 排序',
      'proc.summaryNoThreads': '共 {processes} 个进程 · 按 CPU 排序',
      'proc.empty': '无进程数据',
      'harness.title': 'DSH 进程',
      'harness.subtitle': '当前 DeepSeek Harness 进程树与线程级占用',
      'harness.unavailable': '未检测到 DSH 进程树',
      'harness.unavailableHint': '面板不在 DSH 主进程内运行，或 ps 无法读取进程参数',
      'harness.role.main': '主进程',
      'harness.role.host': 'Host',
      'harness.role.renderer': '渲染进程',
      'harness.role.gpu': 'GPU 进程',
      'harness.role.utility': '工具进程',
      'harness.role.subprocess': '工具子进程',
      'harness.role.terminal': '终端',
      'harness.role.other': '其他',
      'harness.processes': '{count} 个进程',
      'harness.threads': '{count} 线程',
      'harness.cpuShare': '占系统 CPU {value}',
      'harness.memoryShare': '占系统内存 {value}',
      'harness.totalCpu': 'CPU 合计',
      'harness.totalMemory': '内存合计',
      'harness.totalIo': '读写合计',
      'harness.pid': 'PID',
      'harness.role': '角色',
      'harness.rss': '常驻内存',
      'harness.swap': '交换',
      'harness.threadsCol': '线程',
      'harness.io': '读 / 写',
      'harness.fd': '文件描述符',
      'harness.sockets': '套接字',
      'harness.uptime': '运行时长',
      'harness.command': '命令行',
      'harness.hostTitle': 'Host 运行时',
      'harness.heap': 'JS 堆',
      'harness.heapUsage': '{used} / {total}',
      'harness.eventLoop': '事件循环延迟',
      'harness.eventLoopValue': '平均 {mean} · P99 {p99}',
      'harness.handles': '活动句柄',
      'harness.handlesValue': '{count} 个 · {types}',
      'harness.contextSwitches': '上下文切换（自愿 / 非自愿）',
      'harness.versions': 'Node / V8',
      'harness.topThreads': '占用最高的线程',
      'harness.threadState.running': '运行中',
      'harness.threadState.sleeping': '休眠',
      'harness.threadState.disk': '磁盘等待',
      'harness.threadState.zombie': '僵尸',
      'harness.threadState.stopped': '已停止',
      'harness.threadState.idle': '空闲',
      'harness.self': '当前进程',
      'harness.noThreads': '此系统不提供线程级数据',
      'session.title': 'DSH 会话',
      'session.subtitle': '当前打开的会话及其硬件占用',
      'session.empty': '没有活动会话',
      'session.emptyHint': '会话在 Host 内创建后会自动出现在这里',
      'session.unavailable': 'Host 未提供会话服务',
      'session.noProcess': '无子进程',
      'session.id': '会话 ID',
      'session.cwd': '工作目录',
      'session.running': '运行中',
      'session.idle': '空闲',
      'session.messages': '事件数',
      'session.tokens': 'Token',
      'session.tokensValue': '输入 {input} · 输出 {output}',
      'session.cacheTokens': '缓存读取 {value}',
      'session.context': '上下文占用',
      'session.contextValue': '{used} / {window}',
      'session.contextUnknown': '尚无用量记录',
      'session.stats': '轮次 / 步骤',
      'session.statsValue': '{turns} 轮 · {steps} 步',
      'session.llmTime': '模型耗时 {value}',
      'session.toolTime': '工具耗时 {value}',
      'session.logBytes': '会话文件',
      'session.logGrowth': '增长 {value}/s',
      'session.attributed': '关联进程',
      'session.pids': 'PID {pids}',
      'session.processes': '{count} 个进程 · {threads} 线程',
      'session.attribution.environment': '按 DSH_SESSION_ID 归属',
      'session.attribution.heuristic': '按工作目录推断归属',
      'session.attribution.none': '无法归属进程',
      'session.live': '活动',
      'session.persisted': '已归档',
      unknown: '未知',
      unavailable: '不可用',
    };

    /** English copy, checked against the Chinese key set. */
    const en = {
      panel: 'Local machine',
      title: 'Local machine',
      subtitle: 'System information and live CPU, memory, GPU, disk, and network usage',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      updated: 'Last refresh {time}',
      never: 'Not sampled yet',
      error: 'Read failed: {message}',
      'legacy.title': 'Restart DSH to fill these cards',
      'legacy.body': 'The client is updated, but the running Host collector is still the previous version, so it never sends DSH process, thread, or session data. Fully quit and restart DSH to load the new Host code; refreshing the page is not enough.',
      'legacy.release': 'Restart DSH to load system information',
      'status.collecting': 'Collecting',
      'status.paused': 'Paused',
      'status.error': 'Read failed',
      system: 'System',
      autoRefresh: 'Auto refresh',
      every2: 'Every 2 s',
      every5: 'Every 5 s',
      every10: 'Every 10 s',
      off: 'Off',
      'os.detected': 'Detected automatically from this machine',
      'os.operatingSystem': 'Operating system',
      'os.kernel': 'Kernel',
      'os.version': 'Version',
      'os.hostname': 'Hostname',
      'os.computerName': 'Computer name',
      'os.arch': 'Architecture',
      'os.desktop': 'Desktop',
      'os.desktopShort': 'Desktop',
      'os.shell': 'Shell',
      'os.explorer': 'Windows Explorer',
      'os.uptime': 'Uptime',
      'os.boot': 'Booted',
      'os.unknown': 'Unknown system',
      'uptime.days': '{days}d {hours}h {minutes}m',
      'uptime.hours': '{hours}h {minutes}m',
      'uptime.minutes': '{minutes}m',
      'chart.title': 'Usage trend',
      'chart.last60': 'Last 60 s',
      'chart.now': 'Now',
      'chart.empty': 'Collecting trend data…',
      cpu: 'CPU',
      memory: 'Memory',
      gpu: 'GPU',
      disk: 'Disk',
      network: 'Network',
      'cpu.threads': '{count} threads',
      'cpu.load1': '1-min load {value}',
      'cores.title': 'Logical core usage',
      'cores.summary': '{threads} threads',
      'cores.hybrid': '{p}P + {e}E',
      'cores.performance': 'Performance core P',
      'cores.efficiency': 'Efficiency core E',
      'cores.logical': 'Logical cores',
      'cores.load': 'Load average {values}',
      'memory.title': 'Memory',
      'memory.used': 'Used',
      'memory.cache': 'Cache / buffers',
      'memory.free': 'Free',
      'memory.total': 'Total memory',
      'memory.available': 'Available',
      'memory.availableShort': 'Available {value}',
      'memory.swap': 'Swap used',
      'memory.swapFile': 'Swap file used',
      'memory.pagefile': 'Page file used',
      'memory.swapOff': 'Disabled',
      'memory.spec': 'Memory spec',
      'gpu.title': 'GPU',
      'gpu.utilization': 'GPU utilization',
      'gpu.vram': 'VRAM',
      'gpu.power': 'Power',
      'gpu.fan': 'Fan',
      'gpu.driver': 'Driver',
      'gpu.cuda': 'CUDA version',
      'gpu.clocks': 'Core / memory clock',
      'gpu.temp': 'Temperature',
      'gpu.none': 'No GPU detected',
      'gpu.unsupported': 'Usage unavailable',
      'gpu.driverUnavailable': 'Driver unavailable',
      'gpu.vramLine': 'VRAM {value}',
      'gpu.vramValue': '{used} / {total}',
      'gpu.powerValue': '{power} W / {limit} W',
      'gpu.powerShort': '{power} W',
      'gpu.clockValue': '{core} MHz / {memory} MHz',
      'gpu.fanRpm': '{rpm} rpm',
      'disk.title': 'Disk',
      'disk.io': 'Read {read} · Write {write}',
      'disk.ioUnavailable': 'I/O rates unavailable',
      'disk.empty': 'No disks detected',
      'disk.mountUsed': '{mount} used {used}',
      'disk.totalValue': 'Total {total}',
      'net.title': 'Network',
      'net.download': 'Download',
      'net.upload': 'Upload',
      'net.ipv4': 'IPv4 address',
      'net.received': 'Total received',
      'net.sent': 'Total sent',
      'net.empty': 'No network interface',
      'sensors.title': 'Temperature & fans',
      'sensors.normal': 'Everything normal',
      'sensors.hot': 'Temperature high',
      'sensors.unavailable': 'Sensors unavailable',
      'sensors.empty': 'This system exposes no temperature sensors',
      'sensors.cpu': 'CPU package',
      'sensors.gpu': 'GPU core',
      'sensors.nvme': 'NVMe SSD',
      'sensors.board': 'Motherboard',
      'sensors.fan': 'Fan',
      'sensors.other': 'Thermal zone',
      'proc.title': 'Top 8 processes',
      'proc.name': 'Process',
      'proc.pid': 'PID',
      'proc.user': 'User',
      'proc.cpu': 'CPU',
      'proc.mem': 'Memory',
      'proc.vram': 'GPU memory',
      'proc.summary': '{processes} processes · {threads} threads · sorted by CPU',
      'proc.summaryNoThreads': '{processes} processes · sorted by CPU',
      'proc.empty': 'No process data',
      'harness.title': 'DSH processes',
      'harness.subtitle': 'The running DeepSeek Harness process tree and per-thread usage',
      'harness.unavailable': 'No harness process tree detected',
      'harness.unavailableHint': 'The panel is not running inside the DSH main process, or ps cannot read process arguments',
      'harness.role.main': 'Main',
      'harness.role.host': 'Host',
      'harness.role.renderer': 'Renderer',
      'harness.role.gpu': 'GPU',
      'harness.role.utility': 'Utility',
      'harness.role.subprocess': 'Tool subprocess',
      'harness.role.terminal': 'Terminal',
      'harness.role.other': 'Other',
      'harness.processes': '{count} processes',
      'harness.threads': '{count} threads',
      'harness.cpuShare': '{value} of system CPU',
      'harness.memoryShare': '{value} of system memory',
      'harness.totalCpu': 'Total CPU',
      'harness.totalMemory': 'Total memory',
      'harness.totalIo': 'Total I/O',
      'harness.pid': 'PID',
      'harness.role': 'Role',
      'harness.rss': 'Resident',
      'harness.swap': 'Swap',
      'harness.threadsCol': 'Threads',
      'harness.io': 'Read / write',
      'harness.fd': 'File descriptors',
      'harness.sockets': 'Sockets',
      'harness.uptime': 'Uptime',
      'harness.command': 'Command line',
      'harness.hostTitle': 'Host runtime',
      'harness.heap': 'JS heap',
      'harness.heapUsage': '{used} / {total}',
      'harness.eventLoop': 'Event-loop delay',
      'harness.eventLoopValue': 'Mean {mean} · P99 {p99}',
      'harness.handles': 'Active handles',
      'harness.handlesValue': '{count} · {types}',
      'harness.contextSwitches': 'Context switches (voluntary / involuntary)',
      'harness.versions': 'Node / V8',
      'harness.topThreads': 'Busiest threads',
      'harness.threadState.running': 'Running',
      'harness.threadState.sleeping': 'Sleeping',
      'harness.threadState.disk': 'Disk wait',
      'harness.threadState.zombie': 'Zombie',
      'harness.threadState.stopped': 'Stopped',
      'harness.threadState.idle': 'Idle',
      'harness.self': 'This process',
      'harness.noThreads': 'This system exposes no per-thread data',
      'session.title': 'DSH sessions',
      'session.subtitle': 'Open sessions and the hardware they use',
      'session.empty': 'No active sessions',
      'session.emptyHint': 'Sessions appear here once the Host creates them',
      'session.unavailable': 'The Host exposes no session service',
      'session.noProcess': 'No child processes',
      'session.id': 'Session ID',
      'session.cwd': 'Working directory',
      'session.running': 'Running',
      'session.idle': 'Idle',
      'session.messages': 'Events',
      'session.tokens': 'Tokens',
      'session.tokensValue': 'in {input} · out {output}',
      'session.cacheTokens': 'cache read {value}',
      'session.context': 'Context usage',
      'session.contextValue': '{used} / {window}',
      'session.contextUnknown': 'No usage recorded yet',
      'session.stats': 'Turns / steps',
      'session.statsValue': '{turns} turns · {steps} steps',
      'session.llmTime': 'Model {value}',
      'session.toolTime': 'Tools {value}',
      'session.logBytes': 'Session log',
      'session.logGrowth': 'growing {value}/s',
      'session.attributed': 'Linked processes',
      'session.pids': 'PID {pids}',
      'session.processes': '{count} processes · {threads} threads',
      'session.attribution.environment': 'Attributed through DSH_SESSION_ID',
      'session.attribution.heuristic': 'Inferred from the working directory',
      'session.attribution.none': 'Process attribution unavailable',
      'session.live': 'Live',
      'session.persisted': 'Persisted',
      unknown: 'Unknown',
      unavailable: 'Unavailable',
    };

    /** Panel styles mirroring the product design; all colors are local tokens. */
    const CSS = `
.lm-page{
  --lm-bg:#F7F7F8;
  --lm-card:#FFFFFF;
  --lm-border:#ECECEE;
  --lm-border-strong:#E5E7EB;
  --lm-ink:#111827;
  --lm-ink-2:#374151;
  --lm-muted:#6B7280;
  --lm-soft:#F3F4F6;
  --lm-soft-2:#F9FAFB;
  --lm-line:#F1F1F3;
  --lm-green:#22C55E;
  --lm-green-soft:#86EFAC;
  --lm-green-bg:#F0FDF4;
  --lm-green-border:#BBF7D0;
  --lm-green-text:#15803D;
  --lm-amber:#F59E0B;
  --lm-amber-bg:#FFFBEB;
  --lm-amber-border:#FDE68A;
  --lm-amber-text:#92400E;
  --lm-blue:#3B82F6;
  --lm-red:#DC2626;
  --lm-red-bg:#FEF2F2;
  --lm-red-border:#FECACA;
  --lm-red-text:#B91C1C;
  --lm-strong-bg:#111827;
  --lm-strong-fg:#FFFFFF;
  --lm-strong-hover:#374151;
  --lm-core-e:#9CA3AF;
  --lm-row-hover:#FAFAFA;
  display:flex;flex-direction:column;width:100%;min-width:0;height:100%;min-height:0;
  overflow:hidden;background:var(--lm-bg);color:var(--lm-ink);
  font-family:Inter,'PingFang SC','Microsoft YaHei','Noto Sans SC',system-ui,sans-serif;
  font-size:14px;line-height:1.6;
}
body[data-ds-dark-theme] .lm-page{
  --lm-bg:#151517;--lm-card:#1B1B1C;--lm-border:#2C2C2E;--lm-border-strong:#3F3F46;
  --lm-ink:#F1F3F5;--lm-ink-2:#D4D4D8;--lm-muted:#A1A1AA;--lm-soft:#2C2C2E;
  --lm-soft-2:#232324;--lm-line:#232324;--lm-green-soft:#256B3A;
  --lm-green-bg:#12261A;--lm-green-border:#1E5132;--lm-green-text:#4ADE80;
  --lm-amber-bg:#2A2110;--lm-amber-border:#5C4314;--lm-amber-text:#FBBF24;
  --lm-red-bg:#2A1414;--lm-red-border:#5B2020;--lm-red-text:#F87171;
  --lm-strong-bg:#F1F3F5;--lm-strong-fg:#111827;--lm-strong-hover:#D4D4D8;
  --lm-core-e:#6B7280;--lm-row-hover:#232324;
}
.lm-page *,.lm-page *::before,.lm-page *::after{box-sizing:border-box}
.lm-scroll{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable}
.lm-content{max-width:1280px;margin:0 auto;padding:32px 24px 48px;display:flex;flex-direction:column;gap:20px}
[data-platform=darwin] .lm-content{padding-top:calc(32px + var(--dsh-frame-top-clearance,0px))}
.lm-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
.lm-headingText{display:flex;flex-direction:column;gap:6px;min-width:0}
.lm-titleRow{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.lm-title{margin:0;font-size:26px;font-weight:600;line-height:1.25}
.lm-subtitle{margin:0;color:var(--lm-muted);font-size:14px}
.lm-status{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--lm-green-border);border-radius:999px;background:var(--lm-green-bg);color:var(--lm-green-text);font-size:12px;font-weight:500;white-space:nowrap}
.lm-status[data-status=paused]{border-color:var(--lm-border);background:var(--lm-soft);color:var(--lm-muted)}
.lm-status[data-status=error]{border-color:var(--lm-red-border);background:var(--lm-red-bg);color:var(--lm-red-text)}
.lm-statusDot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}
.lm-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.lm-updated{color:var(--lm-muted);font-size:13px;font-variant-numeric:tabular-nums;white-space:nowrap}
.lm-ctl{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 12px;border:1px solid var(--lm-border-strong);border-radius:10px;background:var(--lm-card);color:var(--lm-ink-2);font-size:13px;white-space:nowrap}
.lm-ctl select{border:0;background:transparent;color:var(--lm-ink);font:inherit;outline:none;cursor:pointer;max-width:140px}
.lm-chipValue{color:var(--lm-ink);font-weight:600}
.lm-chipDot{width:7px;height:7px;border-radius:50%;background:var(--lm-green);flex:none}
.lm-btn{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border:1px solid var(--lm-strong-bg);border-radius:10px;background:var(--lm-strong-bg);color:var(--lm-strong-fg);font:inherit;font-size:14px;font-weight:500;cursor:pointer;white-space:nowrap}
.lm-btn:hover:not(:disabled){background:var(--lm-strong-hover);border-color:var(--lm-strong-hover)}
.lm-btn:disabled{opacity:.65;cursor:default}
.lm-btn:focus-visible,.lm-ctl select:focus-visible{outline:2px solid var(--lm-blue);outline-offset:2px}
.lm-spin{animation:lm-spin 1s linear infinite}
@keyframes lm-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.lm-spin{animation:none}.lm-coreFill,.lm-fill{transition:none}}
.lm-error{margin:0;padding:10px 14px;border:1px solid var(--lm-red-border);border-radius:10px;background:var(--lm-red-bg);color:var(--lm-red-text);font-size:13px}
.lm-warning{display:flex;flex-direction:column;gap:2px;padding:10px 14px;border:1px solid var(--lm-amber-border);border-radius:10px;background:var(--lm-amber-bg);color:var(--lm-amber-text);font-size:13px;line-height:1.55}
.lm-warning strong{font-weight:600}
.lm-card{min-width:0;padding:20px 24px;border:1px solid var(--lm-border);border-radius:16px;background:var(--lm-card);display:flex;flex-direction:column;gap:16px}
.lm-systemCard{flex-direction:row;flex-wrap:wrap;align-items:center;gap:24px}
.lm-osIdentity{display:flex;align-items:center;gap:14px;flex:1 1 260px;min-width:0}
.lm-osIcon{width:52px;height:52px;border:1px solid var(--lm-border);border-radius:14px;background:var(--lm-soft);color:var(--lm-ink);display:flex;align-items:center;justify-content:center;flex:none}
.lm-osText{display:flex;flex-direction:column;gap:4px;min-width:0}
.lm-osBadgeRow{display:flex;align-items:center;gap:8px;min-width:0}
.lm-kicker{color:var(--lm-muted);font-size:12px}
.lm-osBadge{padding:2px 8px;border-radius:6px;background:var(--lm-soft);font-size:12px;font-weight:600;white-space:nowrap}
.lm-osRelease{font-size:18px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lm-sysInfo{flex:3 1 560px;min-width:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px 24px}
.lm-sysField{display:flex;flex-direction:column;gap:4px;min-width:0}
.lm-sysLabel{color:var(--lm-muted);font-size:12px}
.lm-sysValue{font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lm-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.lm-kpi{flex-direction:row;align-items:center;gap:18px;padding:20px}
.lm-ringWrap{position:relative;width:92px;height:92px;flex:none}
.lm-ringValue{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:600;font-variant-numeric:tabular-nums}
.lm-kpiBody{display:flex;flex-direction:column;gap:6px;min-width:0}
.lm-kpiLabel{display:flex;align-items:center;font-size:15px;font-weight:600;white-space:nowrap}
.lm-dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;flex:none}
.lm-kpiMeta{color:var(--lm-ink-2);font-size:13px;overflow-wrap:anywhere}
.lm-kpiHint{color:var(--lm-muted);font-size:12px;overflow-wrap:anywhere}
.lm-split{display:flex;flex-wrap:wrap;gap:16px}
.lm-splitTrend{flex:3 1 520px}
.lm-splitCores{flex:2 1 380px}
.lm-cardHead{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
.lm-cardHead h2{margin:0;font-size:16px;font-weight:600;line-height:1.4}
.lm-hint{color:var(--lm-muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lm-chartHead{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.lm-chartLegend{display:flex;align-items:center;gap:16px;flex-wrap:wrap;color:var(--lm-ink-2);font-size:12px}
.lm-legendLine{display:inline-block;width:14px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle}
.lm-chart{position:relative;height:220px}
.lm-chartGrid{position:absolute;inset:0 0 22px 36px;display:flex;flex-direction:column;justify-content:space-between}
.lm-chartGrid>div{border-top:1px dashed var(--lm-border)}
.lm-chartGrid>div:last-child{border-top-style:solid;border-top-color:var(--lm-border-strong)}
.lm-chartY{position:absolute;left:0;top:-7px;bottom:15px;width:30px;display:flex;flex-direction:column;justify-content:space-between;color:var(--lm-muted);font-size:11px;text-align:right}
.lm-chartSvg{position:absolute;left:36px;top:0;width:calc(100% - 36px);height:198px;overflow:hidden}
.lm-chartX{position:absolute;left:36px;right:0;bottom:0;display:flex;justify-content:space-between;color:var(--lm-muted);font-size:11px}
.lm-chartEmpty{position:absolute;left:36px;right:0;top:0;bottom:22px;display:flex;align-items:center;justify-content:center;color:var(--lm-muted);font-size:12px}
.lm-line{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.lm-line[data-series=cpu]{stroke:var(--lm-ink)}
.lm-line[data-series=memory]{stroke:var(--lm-green)}
.lm-line[data-series=gpu]{stroke:var(--lm-amber)}
.lm-point[data-series=cpu]{fill:var(--lm-ink)}
.lm-point[data-series=memory]{fill:var(--lm-green)}
.lm-point[data-series=gpu]{fill:var(--lm-amber)}
.lm-cores{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
.lm-core{display:flex;flex-direction:column;gap:4px;min-width:0}
.lm-coreTrack{height:52px;border-radius:6px;background:var(--lm-soft);display:flex;align-items:flex-end;overflow:hidden}
.lm-coreFill{width:100%;border-radius:6px;transition:height .5s ease}
.lm-coreFill[data-kind=p],.lm-coreFill[data-kind=none]{background:var(--lm-ink)}
.lm-coreFill[data-kind=e]{background:var(--lm-core-e)}
.lm-coreLabels{display:flex;align-items:center;justify-content:space-between;gap:2px;color:var(--lm-muted);font-size:10px;min-width:0}
.lm-corePct{color:var(--lm-ink);white-space:nowrap}
.lm-coreLegend{display:flex;align-items:center;gap:16px;flex-wrap:wrap;color:var(--lm-muted);font-size:12px}
.lm-gridTwo{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px}
.lm-gridThree{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.lm-memStack{display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--lm-soft)}
.lm-memLegend{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.lm-memLegendItem{display:flex;flex-direction:column;gap:4px;min-width:0}
.lm-memLegendLabel{display:flex;align-items:center;color:var(--lm-muted);font-size:12px;min-width:0}
.lm-memLegendValue{font-size:15px;font-weight:600;white-space:nowrap}
.lm-rows{display:flex;flex-direction:column}
.lm-row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--lm-line);font-size:13px}
.lm-row:first-child{padding-top:0;border-top:0}
.lm-rowLabel{color:var(--lm-muted);flex:none}
.lm-rowValue{min-width:0;text-align:right;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.lm-gpuBars{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.lm-miniBar{display:flex;flex-direction:column;gap:8px;min-width:0}
.lm-miniBarHead{display:flex;justify-content:space-between;gap:8px;font-size:12px;min-width:0}
.lm-miniBarLabel{color:var(--lm-muted);flex:none}
.lm-miniBarValue{font-weight:500;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lm-track{height:8px;border-radius:4px;background:var(--lm-soft);overflow:hidden}
.lm-fill{height:100%;border-radius:4px;transition:width .5s ease}
.lm-diskList{display:flex;flex-direction:column;gap:16px}
.lm-disk{display:flex;flex-direction:column;gap:8px}
.lm-diskHead{display:flex;justify-content:space-between;gap:8px;font-size:13px;flex-wrap:wrap}
.lm-diskName{display:flex;align-items:baseline;gap:6px;font-weight:500;min-width:0;white-space:nowrap}
.lm-diskFs{color:var(--lm-muted);font-weight:400;overflow:hidden;text-overflow:ellipsis;min-width:0}
.lm-diskValue{color:var(--lm-ink-2);font-variant-numeric:tabular-nums;white-space:nowrap}
.lm-netSpeed{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.lm-netTile{background:var(--lm-soft-2);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:4px;min-width:0}
.lm-netTileLabel{display:inline-flex;align-items:center;gap:6px;color:var(--lm-muted);font-size:12px}
.lm-netTileValue{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lm-netTileUnit{color:var(--lm-muted);font-size:13px;font-weight:500}
.lm-sensorList{display:flex;flex-direction:column;gap:14px}
.lm-sensorRow{display:grid;grid-template-columns:96px minmax(0,1fr) 72px;align-items:center;gap:12px;font-size:13px}
.lm-sensorLabel{color:var(--lm-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lm-sensorValue{text-align:right;font-weight:500;font-variant-numeric:tabular-nums}
.lm-tableWrap{overflow-x:auto}
.lm-table{width:100%;min-width:640px;border-collapse:collapse;font-size:13px}
.lm-table th{padding:8px 12px;border-bottom:1px solid var(--lm-border);color:var(--lm-muted);font-weight:500;text-align:left;white-space:nowrap}
.lm-table td{padding:10px 12px;border-bottom:1px solid var(--lm-line);white-space:nowrap}
.lm-table th:first-child,.lm-table td:first-child{padding-left:0}
.lm-table th:last-child,.lm-table td:last-child{padding-right:0;text-align:right}
.lm-table tbody tr:last-child td{border-bottom:0}
.lm-table tbody tr:hover td{background:var(--lm-row-hover)}
.lm-processCard{gap:12px}
.lm-procName{max-width:240px;overflow:hidden;text-overflow:ellipsis;font-weight:500}
.lm-procMuted{color:var(--lm-muted)}
.lm-cpuCell{display:flex;align-items:center;gap:10px;min-width:160px}
.lm-cpuTrack{flex:1;height:6px}
.lm-cpuValue{width:52px;text-align:right;font-variant-numeric:tabular-nums}
.lm-empty{padding:18px 0;color:var(--lm-muted);font-size:13px;text-align:center}
.lm-harnessCard{gap:14px}
.lm-harnessHead{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.lm-harnessTitle{display:flex;flex-direction:column;gap:2px;min-width:0}
.lm-harnessTitle h2{margin:0;font-size:16px;font-weight:600}
.lm-harnessTitle p{margin:0;color:var(--lm-muted);font-size:12px}
.lm-harnessStats{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.lm-statChip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid var(--lm-border);border-radius:8px;background:var(--lm-soft-2);font-size:12px;white-space:nowrap}
.lm-statChipLabel{color:var(--lm-muted)}
.lm-statChipValue{font-weight:600;font-variant-numeric:tabular-nums}
.lm-roleBadge{display:inline-flex;align-items:center;padding:1px 7px;border-radius:6px;background:var(--lm-soft);color:var(--lm-ink-2);font-size:11px;font-weight:600;white-space:nowrap}
.lm-roleBadge[data-role=host]{background:var(--lm-green-bg);color:var(--lm-green-text)}
.lm-roleBadge[data-role=renderer]{background:#EFF6FF;color:#1D4ED8}
.lm-roleBadge[data-role=subprocess],.lm-roleBadge[data-role=terminal]{background:var(--lm-amber-bg);color:var(--lm-amber-text)}
body[data-ds-dark-theme] .lm-roleBadge[data-role=renderer]{background:#16233C;color:#93C5FD}
.lm-harnessTable{min-width:860px}
.lm-harnessTable td{font-variant-numeric:tabular-nums}
.lm-harnessName{display:flex;flex-direction:column;gap:1px;min-width:0}
.lm-harnessNameText{display:flex;align-items:center;gap:6px;font-weight:500}
.lm-harnessCmd{max-width:320px;overflow:hidden;text-overflow:ellipsis;color:var(--lm-muted);font-size:11px}
.lm-selfTag{padding:0 5px;border-radius:4px;background:var(--lm-strong-bg);color:var(--lm-strong-fg);font-size:10px;font-weight:600}
.lm-hostGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px 20px}
.lm-threadList{display:flex;flex-direction:column;gap:6px}
.lm-threadRow{display:grid;grid-template-columns:minmax(0,1fr) 140px 64px;align-items:center;gap:10px;font-size:12px}
.lm-threadName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.lm-threadCpu{text-align:right;font-variant-numeric:tabular-nums;font-weight:500}
.lm-threadState{color:var(--lm-muted);font-size:11px;white-space:nowrap}
.lm-sessionList{display:flex;flex-direction:column;gap:12px}
.lm-session{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border:1px solid var(--lm-border);border-radius:12px;background:var(--lm-soft-2);min-width:0}
.lm-session[data-running=true]{border-color:var(--lm-green-border);background:var(--lm-green-bg)}
.lm-sessionHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.lm-sessionTitle{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 240px}
.lm-sessionName{display:flex;align-items:center;gap:8px;font-weight:600;min-width:0}
.lm-sessionNameText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lm-sessionId{color:var(--lm-muted);font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lm-sessionState{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--lm-ink-2);white-space:nowrap}
.lm-sessionStateDot{width:7px;height:7px;border-radius:50%;background:var(--lm-core-e)}
.lm-sessionState[data-running=true] .lm-sessionStateDot{background:var(--lm-green);box-shadow:0 0 0 3px var(--lm-green-bg)}
.lm-sessionGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 18px}
.lm-sessionField{display:flex;flex-direction:column;gap:2px;min-width:0}
.lm-sessionFieldLabel{color:var(--lm-muted);font-size:11px}
.lm-sessionFieldValue{font-size:13px;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lm-sessionBar{display:flex;flex-direction:column;gap:4px}
.lm-sessionBarHead{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--lm-muted);font-variant-numeric:tabular-nums}
.lm-sessionFoot{display:flex;align-items:center;gap:12px;flex-wrap:wrap;color:var(--lm-muted);font-size:11px}
.lm-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
@media (max-width:900px){
  .lm-content{padding:20px 16px 32px;gap:16px}
  .lm-card{padding:16px 18px}
  .lm-kpi{padding:16px}
  .lm-splitTrend,.lm-splitCores{flex-basis:100%}
}
@media (max-width:640px){
  .lm-heading{align-items:flex-start}
  .lm-actions{width:100%}
  .lm-updated{width:100%}
  .lm-sensorRow{grid-template-columns:80px minmax(0,1fr) 62px}
  .lm-gridTwo,.lm-gridThree{grid-template-columns:minmax(0,1fr)}
  .lm-splitTrend,.lm-splitCores{flex-basis:100%}
  .lm-threadRow{grid-template-columns:minmax(0,1fr) 90px 56px}
  .lm-sessionGrid{grid-template-columns:minmax(0,1fr)}
}
`;

    /** Official DeepSeek Harness whale mark, used as the panel brand. */
    const DEEPSEEK_MARK = '<svg width="40" height="40" viewBox="0 0 50 50" fill="none" aria-hidden="true" focusable="false"><path d="M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z" fill="currentColor" fill-rule="nonzero"/></svg>';

    /**
     * Resolve the current text binding from the slot props.
     * @param props - Slot props supplied by the host.
     * @returns Translate function.
     */
    function translateOf(props) {
      return typeof props.t === 'function' ? props.t : (key) => key;
    }

    /**
     * Read one finite number.
     * @param value - Raw value.
     * @returns Number or null.
     */
    function numberOrNull(value) {
      if (value === null || value === undefined) return null;
      if (typeof value === 'string' && value.trim() === '') return null;
      const parsed = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    /**
     * Read one non-empty string.
     * @param value - Raw value.
     * @returns Trimmed string or null.
     */
    function textOrNull(value) {
      return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
    }

    /**
     * Clamp a percentage into its display range.
     * @param value - Raw percentage.
     * @returns Value within 0-100, or null.
     */
    function percentOrNull(value) {
      const parsed = numberOrNull(value);
      return parsed === null ? null : Math.min(100, Math.max(0, parsed));
    }

    /**
     * Render one percentage for display.
     * @param value - Percentage or null.
     * @returns Display string.
     */
    function formatPercent(value) {
      const parsed = percentOrNull(value);
      if (parsed === null) return '—';
      const rounded = Math.round(parsed * 10) / 10;
      return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)) + '%';
    }

    /**
     * Format a byte count.
     * @param bytes - Byte count or null.
     * @returns `12.3 GB` style text, or null.
     */
    function formatBytes(bytes) {
      const value = numberOrNull(bytes);
      if (value === null || value < 0) return null;
      if (value === 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
      let scaled = value;
      let unit = 0;
      while (scaled >= 1024 && unit < units.length - 1) {
        scaled /= 1024;
        unit += 1;
      }
      const digits = unit === 0 || scaled >= 100 ? 0 : 1;
      const text = digits === 0
        ? String(Math.round(scaled))
        : scaled.toFixed(1).replace(/\.0$/, '');
      return text + ' ' + units[unit];
    }

    /**
     * Format a rate.
     * @param bytesPerSecond - Rate or null.
     * @returns `12.4 MB/s` style text, or null.
     */
    function formatRate(bytesPerSecond) {
      const text = formatBytes(bytesPerSecond);
      return text === null ? null : text + '/s';
    }

    /**
     * Split a formatted rate into value and unit.
     * @param bytesPerSecond - Rate or null.
     * @returns Value and unit, or nulls.
     */
    function splitRate(bytesPerSecond) {
      const text = formatRate(bytesPerSecond);
      if (text === null) return [null, null];
      const index = text.lastIndexOf(' ');
      if (index < 0) return [text, ''];
      return [text.slice(0, index), text.slice(index + 1)];
    }

    /**
     * Format a CPU frequency.
     * @param mhz - Megahertz or null.
     * @returns Display string or null.
     */
    function formatFrequency(mhz) {
      const value = numberOrNull(mhz);
      if (value === null || value <= 0) return null;
      if (value >= 1000) {
        return (value / 1000).toFixed(1).replace(/\.0$/, '') + ' GHz';
      }
      return Math.round(value) + ' MHz';
    }

    /**
     * Format a link speed.
     * @param mbps - Megabits per second or null.
     * @returns Display string or null.
     */
    function formatLinkSpeed(mbps) {
      const value = numberOrNull(mbps);
      if (value === null || value <= 0) return null;
      if (value >= 1000) {
        return (value / 1000).toFixed(1).replace(/\.0$/, '') + ' Gbps';
      }
      return Math.round(value) + ' Mbps';
    }

    /**
     * Format a GPU capacity with one decimal in GB.
     * @param bytes - Byte count or null.
     * @returns Display string or null.
     */
    function formatGpuTotal(bytes) {
      const value = numberOrNull(bytes);
      if (value === null) return null;
      if (value >= 1024 ** 3) return (value / 1024 ** 3).toFixed(1) + ' GB';
      return formatBytes(value);
    }

    /**
     * Format a process count with thousands separators.
     * @param value - Count.
     * @returns Display string.
     */
    function formatCount(value) {
      const parsed = numberOrNull(value);
      if (parsed === null) return '—';
      try {
        return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(parsed);
      } catch {
        return String(Math.round(parsed));
      }
    }

    /**
     * Format a clock time.
     * @param value - Epoch milliseconds.
     * @returns `HH:mm:ss` text.
     */
    function formatClock(value) {
      const time = numberOrNull(value);
      if (time === null) return '--:--:--';
      const date = new Date(time);
      if (Number.isNaN(date.getTime())) return '--:--:--';
      return [date.getHours(), date.getMinutes(), date.getSeconds()]
        .map((part) => String(part).padStart(2, '0'))
        .join(':');
    }

    /**
     * Format a boot timestamp.
     * @param value - ISO string.
     * @returns `YYYY-MM-DD HH:mm` text or null.
     */
    function formatDateTime(value) {
      if (typeof value !== 'string' || value === '') return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      const pad = (part) => String(part).padStart(2, '0');
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
        + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    }

    /**
     * Format an uptime in the active language.
     * @param seconds - Uptime seconds or null.
     * @param t - Translate function.
     * @returns Display string or null.
     */
    function formatUptime(seconds, t) {
      const value = numberOrNull(seconds);
      if (value === null || value < 0) return null;
      const totalMinutes = Math.floor(value / 60);
      const days = Math.floor(totalMinutes / 1440);
      const hours = Math.floor((totalMinutes % 1440) / 60);
      const minutes = totalMinutes % 60;
      if (days > 0) return t('uptime.days', { days, hours, minutes });
      if (hours > 0) return t('uptime.hours', { hours, minutes });
      return t('uptime.minutes', { minutes });
    }

    /**
     * Normalize a CPU model name.
     * @param value - Raw model.
     * @returns Clean text or null.
     */
    function cleanCpuModel(value) {
      const text = textOrNull(value);
      if (text === null) return null;
      return text.replace(/\(R\)/gu, '').replace(/\(TM\)/gu, '').replace(/\s+/gu, ' ').trim();
    }

    /**
     * Shorten a GPU name for the KPI card.
     * @param value - Raw model.
     * @returns Clean text or null.
     */
    function shortGpuName(value) {
      const text = textOrNull(value);
      if (text === null) return null;
      return text.replace(/^NVIDIA\s+(?:GeForce\s+)?/iu, '').replace(/^AMD\s+Radeon\s+/iu, 'Radeon ');
    }

    /**
     * Compute a memory utilization percentage.
     * @param memory - Memory block.
     * @returns Percentage or null.
     */
    function memoryPercent(memory) {
      const direct = percentOrNull(memory?.usage);
      if (direct !== null) return direct;
      const used = numberOrNull(memory?.usedBytes);
      const total = numberOrNull(memory?.totalBytes);
      return used !== null && total !== null && total > 0 ? (used / total) * 100 : null;
    }

    /**
     * Build the snapshot URL against the page the panel renders in.
     * @returns Same-origin URL of the Host route.
     */
    function metricsUrl() {
      try {
        return new URL('local-machine/metrics', document.baseURI).toString();
      } catch {
        return '/local-machine/metrics';
      }
    }

    /**
     * Read one snapshot from the Host.
     * @param signal - Optional abort signal.
     * @returns Parsed snapshot payload.
     */
    async function fetchSnapshot(signal) {
      const response = await fetch(metricsUrl(), {
        headers: { accept: 'application/json' },
        cache: 'no-store',
        signal,
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const body = await response.json();
      if (typeof body !== 'object' || body === null) throw new Error('invalid payload');
      if (typeof body.error === 'string') throw new Error(body.error);
      return body;
    }

    /**
     * Build one chart point from a snapshot.
     * @param data - Snapshot payload.
     * @param at - Sampling time.
     * @returns History point.
     */
    function historyPoint(data, at) {
      return {
        at,
        cpu: percentOrNull(data?.cpu?.usage),
        memory: memoryPercent(data?.memory),
        gpu: data?.gpu?.available === true ? percentOrNull(data.gpu.usage) : null,
      };
    }

    /**
     * Append a point to the 60-second trend history.
     * @param history - Previous points.
     * @param point - New point.
     * @returns Trimmed history.
     */
    function appendHistory(history, point) {
      const cutoff = point.at - 65_000;
      return [...history, point].filter((entry) => entry.at >= cutoff).slice(-120);
    }

    /**
     * Own the snapshot state of one mounted panel.
     * @returns Snapshot, history, and refresh action.
     */
    function useSnapshot() {
      const [state, setState] = React.useState({
        data: null,
        error: null,
        loading: true,
        at: null,
        history: [],
      });
      const inFlight = React.useRef(false);
      const mounted = React.useRef(true);
      const controllerRef = React.useRef(null);
      const latest = React.useRef(0);
      const refresh = React.useCallback(() => {
        if (inFlight.current) return;
        inFlight.current = true;
        const ticket = latest.current + 1;
        latest.current = ticket;
        setState((previous) => ({ ...previous, error: null, loading: true }));
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        controllerRef.current = controller;
        fetchSnapshot(controller === null ? undefined : controller.signal).then((data) => {
          if (!mounted.current || latest.current !== ticket) return;
          const sampled = typeof data.sampledAt === 'string' ? Date.parse(data.sampledAt) : Number.NaN;
          const at = Number.isFinite(sampled) ? sampled : Date.now();
          const point = historyPoint(data, at);
          setState((previous) => ({
            data,
            error: null,
            loading: false,
            at,
            history: appendHistory(previous.history, point),
          }));
        }, (error) => {
          if (!mounted.current || latest.current !== ticket) return;
          if (error !== null && typeof error === 'object' && error.name === 'AbortError') return;
          setState((previous) => ({
            ...previous,
            error: error instanceof Error ? error.message : String(error),
            loading: false,
          }));
        }).finally(() => {
          if (latest.current === ticket) inFlight.current = false;
        });
      }, []);
      React.useEffect(() => {
        mounted.current = true;
        refresh();
        return () => {
          mounted.current = false;
          if (controllerRef.current !== null && typeof controllerRef.current.abort === 'function') {
            controllerRef.current.abort();
          }
        };
      }, [refresh]);
      return { ...state, refresh };
    }

    /**
     * The status pill.
     * @param props - Status and text.
     * @returns The pill element.
     */
    function StatusPill(props) {
      return h('span', {
        className: 'lm-status',
        'data-status': props.status,
        role: 'status',
        'aria-live': 'polite',
      }, [
        h('span', { key: 'dot', className: 'lm-statusDot', 'aria-hidden': 'true' }),
        h('span', { key: 'text' }, props.text),
      ]);
    }

    /**
     * One card heading.
     * @param props - Title and optional hint.
     * @returns The heading element.
     */
    function CardHead(props) {
      return h('div', { className: 'lm-cardHead' }, [
        h('h2', { key: 'title' }, props.title),
        props.hint === null || props.hint === undefined || props.hint === ''
          ? null
          : h('span', { key: 'hint', className: 'lm-hint', title: props.hintTitle }, props.hint),
      ]);
    }

    /**
     * One label/value row.
     * @param props - Row content.
     * @returns The row element.
     */
    function KvRow(props) {
      return h('div', { className: 'lm-row' }, [
        h('span', { key: 'label', className: 'lm-rowLabel' }, props.label),
        h('span', { key: 'value', className: 'lm-rowValue' }, props.value),
      ]);
    }

    /**
     * One mini progress bar.
     * @param props - Label, value text, width percentage, tone.
     * @returns The bar element.
     */
    function MiniBar(props) {
      const width = percentOrNull(props.width);
      return h('div', { className: 'lm-miniBar' }, [
        h('div', { key: 'head', className: 'lm-miniBarHead' }, [
          h('span', { key: 'label', className: 'lm-miniBarLabel' }, props.label),
          h('span', { key: 'value', className: 'lm-miniBarValue', title: props.value }, props.value),
        ]),
        h('div', { key: 'track', className: 'lm-track' }, h('div', {
          className: 'lm-fill',
          style: { width: (width === null ? 0 : width) + '%', background: props.color },
        })),
      ]);
    }

    /**
     * One KPI card with a progress ring.
     * @param props - Label, percentage, tone, model, and hint.
     * @returns The card element.
     */
    function KpiCard(props) {
      const value = percentOrNull(props.value);
      const circumference = 2 * Math.PI * 38;
      const dash = value === null ? 0 : (circumference * value) / 100;
      return h('section', { className: 'lm-card lm-kpi', 'aria-label': props.label }, [
        h('div', { key: 'ring', className: 'lm-ringWrap', 'aria-hidden': 'true' }, [
          h('svg', {
            key: 'svg',
            width: 92,
            height: 92,
            viewBox: '0 0 92 92',
          }, [
            h('circle', {
              key: 'track',
              cx: 46,
              cy: 46,
              r: 38,
              fill: 'none',
              stroke: 'var(--lm-soft)',
              strokeWidth: 9,
            }),
            value === null || value <= 0
              ? null
              : h('circle', {
                key: 'value',
                cx: 46,
                cy: 46,
                r: 38,
                fill: 'none',
                stroke: props.color,
                strokeWidth: 9,
                strokeLinecap: 'round',
                strokeDasharray: dash.toFixed(1) + ' ' + circumference.toFixed(1),
                transform: 'rotate(-90 46 46)',
                style: { transition: 'stroke-dasharray .6s' },
              }),
          ]),
          h('div', { key: 'value', className: 'lm-ringValue' }, formatPercent(value)),
        ]),
        h('div', { key: 'body', className: 'lm-kpiBody' }, [
          h('div', { key: 'label', className: 'lm-kpiLabel' }, [
            h('span', { key: 'dot', className: 'lm-dot', style: { background: props.color }, 'aria-hidden': 'true' }),
            props.label,
          ]),
          h('span', { key: 'meta', className: 'lm-kpiMeta', title: props.meta }, props.meta),
          h('span', { key: 'hint', className: 'lm-kpiHint', title: props.hint }, props.hint),
        ]),
      ]);
    }

    /**
     * The 60-second line chart.
     * @param props - History and translate function.
     * @returns The chart card.
     */
    function TrendChart(props) {
      const t = props.t;
      const history = props.history;
      const WIDTH = 590;
      const HEIGHT = 198;
      const points = history.filter((point) => numberOrNull(point.at) !== null);
      const latest = points.length === 0 ? Date.now() : points[points.length - 1].at;
      const start = latest - 60_000;
      const series = [
        { key: 'cpu', label: t('cpu') },
        { key: 'memory', label: t('memory') },
        { key: 'gpu', label: t('gpu') },
      ];
      let maxValue = 0;
      for (const point of points) {
        for (const item of series) {
          const value = numberOrNull(point[item.key]);
          if (value !== null && value > maxValue) maxValue = value;
        }
      }
      const axisMax = Math.min(100, Math.max(30, Math.ceil(maxValue / 10) * 10));
      const axisLabels = [axisMax, Math.round((axisMax * 2) / 3), Math.round(axisMax / 3), 0];
      const xOf = (at) => Math.min(WIDTH, Math.max(0, ((at - start) / 60_000) * WIDTH));
      const yOf = (value) => HEIGHT - (Math.min(value, axisMax) / axisMax) * HEIGHT;
      const drawable = points.filter((point) => point.at >= start - 1000);
      return h('section', { className: 'lm-card lm-splitTrend', 'aria-label': t('chart.title') }, [
        h('div', { key: 'head', className: 'lm-chartHead' }, [
          h('h2', { key: 'title', style: { margin: 0, fontSize: 16, fontWeight: 600 } }, t('chart.title')),
          h('div', { key: 'legend', className: 'lm-chartLegend' }, [
            h('span', { key: 'cpu' }, [
              h('span', { key: 'dot', className: 'lm-legendLine', style: { background: 'var(--lm-ink)' } }),
              t('cpu'),
            ]),
            h('span', { key: 'memory' }, [
              h('span', { key: 'dot', className: 'lm-legendLine', style: { background: 'var(--lm-green)' } }),
              t('memory'),
            ]),
            h('span', { key: 'gpu' }, [
              h('span', { key: 'dot', className: 'lm-legendLine', style: { background: 'var(--lm-amber)' } }),
              t('gpu'),
            ]),
            h('span', { key: 'span', style: { color: 'var(--lm-muted)' } }, t('chart.last60')),
          ]),
        ]),
        h('div', { key: 'chart', className: 'lm-chart' }, [
          h('div', { key: 'grid', className: 'lm-chartGrid', 'aria-hidden': 'true' },
            axisLabels.map((value, index) => h('div', { key: 'line' + index }))),
          h('div', { key: 'y', className: 'lm-chartY', 'aria-hidden': 'true' },
            axisLabels.map((value, index) => h('span', { key: 'y' + index }, value + '%'))),
          h('svg', {
            key: 'svg',
            className: 'lm-chartSvg',
            viewBox: '0 0 ' + WIDTH + ' ' + HEIGHT,
            preserveAspectRatio: 'none',
            role: 'img',
            'aria-label': t('chart.last60'),
          }, series.map((item) => {
            const values = drawable
              .map((point) => ({ at: point.at, value: numberOrNull(point[item.key]) }))
              .filter((entry) => entry.value !== null);
            if (values.length === 0) return null;
            if (values.length === 1) {
              return h('circle', {
                key: item.key,
                className: 'lm-point',
                'data-series': item.key,
                cx: xOf(values[0].at).toFixed(1),
                cy: yOf(values[0].value).toFixed(1),
                r: 2.5,
              });
            }
            const coords = values.map((entry) => (
              xOf(entry.at).toFixed(1) + ',' + yOf(entry.value).toFixed(1)
            )).join(' ');
            return h('polyline', {
              key: item.key,
              className: 'lm-line',
              'data-series': item.key,
              points: coords,
              vectorEffect: 'non-scaling-stroke',
            });
          })),
          points.length < 2
            ? h('div', { key: 'empty', className: 'lm-chartEmpty' }, t('chart.empty'))
            : null,
          h('div', { key: 'x', className: 'lm-chartX', 'aria-hidden': 'true' }, [
            h('span', { key: 'a' }, '-60s'),
            h('span', { key: 'b' }, '-45s'),
            h('span', { key: 'c' }, '-30s'),
            h('span', { key: 'd' }, '-15s'),
            h('span', { key: 'e' }, t('chart.now')),
          ]),
        ]),
      ]);
    }

    /**
     * The per-logical-core usage card.
     * @param props - CPU block and translate function.
     * @returns The card element.
     */
    function CoresCard(props) {
      const t = props.t;
      const cpu = props.cpu;
      const threads = numberOrNull(cpu?.threads) ?? numberOrNull(cpu?.cores) ?? 0;
      const hybrid = cpu?.hybrid === true;
      const performance = numberOrNull(cpu?.performanceCores);
      const efficiency = numberOrNull(cpu?.efficiencyCores);
      const perCore = Array.isArray(cpu?.perCore) ? cpu.perCore : [];
      const rows = threads > 0
        ? Array.from({ length: threads }, (_, index) => {
          const entry = perCore[index];
          return {
            index,
            usage: percentOrNull(entry?.usage),
            kind: entry?.kind === 'p' || entry?.kind === 'e' ? entry.kind : 'none',
          };
        })
        : [];
      let pIndex = 0;
      let eIndex = 0;
      const summary = threads > 0 ? t('cores.summary', { threads: formatCount(threads) }) : null;
      const hybridText = hybrid && performance !== null && efficiency !== null
        ? t('cores.hybrid', { p: performance, e: efficiency })
        : null;
      const loadValues = Array.isArray(cpu?.loadAverage)
        ? cpu.loadAverage.filter((value) => numberOrNull(value) !== null)
        : numberOrNull(cpu?.load) !== null ? [cpu.load] : [];
      return h('section', { className: 'lm-card lm-splitCores', 'aria-label': t('cores.title') }, [
        h('div', { key: 'head', className: 'lm-cardHead' }, [
          h('h2', { key: 'title' }, t('cores.title')),
          h('span', { key: 'hint', className: 'lm-hint' }, [
            summary,
            hybridText,
          ].filter(Boolean).join(' · ')),
        ]),
        rows.length === 0
          ? h('div', { className: 'lm-empty' }, t('unavailable'))
          : h('div', { key: 'grid', className: 'lm-cores' }, rows.map((row) => {
            let label;
            if (row.kind === 'p') {
              label = 'P' + pIndex;
              pIndex += 1;
            } else if (row.kind === 'e') {
              label = 'E' + eIndex;
              eIndex += 1;
            } else {
              label = 'C' + row.index;
            }
            return h('div', { key: 'core' + row.index, className: 'lm-core' }, [
              h('div', { key: 'track', className: 'lm-coreTrack' }, h('div', {
                className: 'lm-coreFill',
                'data-kind': row.kind,
                style: { height: (row.usage === null ? 0 : Math.max(row.usage, 3)) + '%' },
              })),
              h('div', { key: 'labels', className: 'lm-coreLabels' }, [
                h('span', { key: 'name' }, label),
                h('span', { key: 'value', className: 'lm-corePct' }, row.usage === null ? '—' : Math.round(row.usage) + '%'),
              ]),
            ]);
          })),
        h('div', { key: 'legend', className: 'lm-coreLegend' }, [
          hybrid
            ? h('span', { key: 'p' }, [
              h('span', { key: 'dot', className: 'lm-dot', style: { background: 'var(--lm-ink)', width: 10, height: 10 } }),
              t('cores.performance'),
            ])
            : h('span', { key: 'logical' }, [
              h('span', { key: 'dot', className: 'lm-dot', style: { background: 'var(--lm-ink)', width: 10, height: 10 } }),
              t('cores.logical'),
            ]),
          hybrid
            ? h('span', { key: 'e' }, [
              h('span', { key: 'dot', className: 'lm-dot', style: { background: 'var(--lm-core-e)', width: 10, height: 10 } }),
              t('cores.efficiency'),
            ])
            : null,
          loadValues.length === 0
            ? null
            : h('span', { key: 'load' }, t('cores.load', {
              values: loadValues.map((value) => Number(value).toFixed(2)).join(' · '),
            })),
        ]),
      ]);
    }

    /**
     * The memory card.
     * @param props - Memory block, platform, and translate function.
     * @returns The card element.
     */
    function MemoryCard(props) {
      const t = props.t;
      const memory = props.memory;
      const total = numberOrNull(memory?.totalBytes);
      const used = numberOrNull(memory?.usedBytes);
      const available = numberOrNull(memory?.availableBytes);
      let cached = numberOrNull(memory?.cachedBytes);
      let free = numberOrNull(memory?.freeBytes);
      if (free === null && total !== null && used !== null) {
        free = Math.max(0, total - used - (cached === null ? 0 : cached));
      }
      const usedPct = total !== null && used !== null && total > 0 ? Math.min(100, (used / total) * 100) : 0;
      const cachedPct = total !== null && cached !== null && total > 0 ? Math.min(100, (cached / total) * 100) : 0;
      const freePct = Math.max(0, 100 - usedPct - cachedPct);
      const swapLabel = props.platform === 'win32'
        ? t('memory.pagefile')
        : props.platform === 'darwin' ? t('memory.swapFile') : t('memory.swap');
      const swapTotal = numberOrNull(memory?.swapTotalBytes);
      const swapUsed = numberOrNull(memory?.swapUsedBytes);
      const swapValue = memory === null || memory === undefined
        ? '—'
        : swapTotal === 0
          ? t('memory.swapOff')
          : swapTotal === null || swapTotal === undefined
            ? t('unavailable')
            : (formatBytes(swapUsed) ?? '—') + ' / ' + (formatBytes(swapTotal) ?? '—');
      const head = total === null || used === null
        ? t('unavailable')
        : (formatBytes(used) ?? '—') + ' / ' + (formatBytes(total) ?? '—');
      return h('section', { className: 'lm-card', 'aria-label': t('memory.title') }, [
        h(CardHead, { key: 'head', title: t('memory.title'), hint: head }),
        h('div', { key: 'stack', className: 'lm-memStack', 'aria-hidden': 'true' }, [
          h('div', { key: 'used', style: { width: usedPct + '%', background: 'var(--lm-green)' } }),
          cached === null
            ? null
            : h('div', { key: 'cached', style: { width: cachedPct + '%', background: 'var(--lm-green-soft)' } }),
          h('div', { key: 'free', style: { width: freePct + '%', background: 'var(--lm-soft)' } }),
        ]),
        h('div', { key: 'legend', className: 'lm-memLegend' }, [
          h('div', { key: 'used', className: 'lm-memLegendItem' }, [
            h('span', { key: 'label', className: 'lm-memLegendLabel' }, [
              h('span', { key: 'dot', className: 'lm-dot', style: { background: 'var(--lm-green)' } }),
              t('memory.used'),
            ]),
            h('span', { key: 'value', className: 'lm-memLegendValue' }, formatBytes(used) ?? '—'),
          ]),
          h('div', { key: 'cache', className: 'lm-memLegendItem' }, [
            h('span', { key: 'label', className: 'lm-memLegendLabel' }, [
              h('span', { key: 'dot', className: 'lm-dot', style: { background: 'var(--lm-green-soft)' } }),
              t('memory.cache'),
            ]),
            h('span', { key: 'value', className: 'lm-memLegendValue' }, cached === null ? '—' : formatBytes(cached) ?? '—'),
          ]),
          h('div', { key: 'free', className: 'lm-memLegendItem' }, [
            h('span', { key: 'label', className: 'lm-memLegendLabel' }, [
              h('span', { key: 'dot', className: 'lm-dot', style: { background: 'var(--lm-soft)' } }),
              t('memory.free'),
            ]),
            h('span', { key: 'value', className: 'lm-memLegendValue' }, formatBytes(free) ?? '—'),
          ]),
        ]),
        h('div', { key: 'rows', className: 'lm-rows' }, [
          h(KvRow, { key: 'total', label: t('memory.total'), value: formatBytes(total) ?? '—' }),
          h(KvRow, { key: 'available', label: t('memory.available'), value: formatBytes(available) ?? '—' }),
          h(KvRow, { key: 'swap', label: swapLabel, value: swapValue }),
          h(KvRow, { key: 'spec', label: t('memory.spec'), value: textOrNull(memory?.spec) ?? '—' }),
        ]),
      ]);
    }

    /**
     * The GPU card.
     * @param props - GPU block and translate function.
     * @returns The card element.
     */
    function GpuCard(props) {
      const t = props.t;
      const gpu = props.gpu;
      const name = textOrNull(gpu?.name);
      const usage = gpu?.available === true ? percentOrNull(gpu?.usage) : null;
      const vramUsed = numberOrNull(gpu?.memoryUsedBytes);
      const vramTotal = numberOrNull(gpu?.memoryTotalBytes);
      const vramPct = vramUsed !== null && vramTotal !== null && vramTotal > 0
        ? Math.min(100, (vramUsed / vramTotal) * 100)
        : null;
      const power = numberOrNull(gpu?.powerWatts);
      const powerLimit = numberOrNull(gpu?.powerLimitWatts);
      const powerPct = power !== null && powerLimit !== null && powerLimit > 0
        ? Math.min(100, (power / powerLimit) * 100)
        : null;
      const fanPercent = numberOrNull(gpu?.fanPercent);
      const fanRpm = numberOrNull(gpu?.fanRpm);
      const fanWidth = fanPercent !== null ? Math.min(100, fanPercent) : fanRpm !== null ? Math.min(100, (fanRpm / 3000) * 100) : null;
      const fanText = fanPercent !== null
        ? formatPercent(fanPercent)
        : fanRpm !== null ? t('gpu.fanRpm', { rpm: Math.round(fanRpm) }) : '—';
      const reason = gpu !== null && gpu !== undefined && gpu.available !== true
        ? (gpu.reason === 'driver-unavailable'
          ? t('gpu.driverUnavailable')
          : gpu.reason === 'unsupported' ? t('gpu.unsupported') : name === null ? t('gpu.none') : t('gpu.unsupported'))
        : null;
      const hint = name === null ? t('gpu.none') : reason === null ? name : name + ' · ' + reason;
      const vramText = vramUsed !== null && vramTotal !== null
        ? t('gpu.vramValue', { used: formatBytes(vramUsed), total: formatGpuTotal(vramTotal) })
        : vramUsed !== null ? formatBytes(vramUsed) ?? '—' : '—';
      const powerText = power !== null && powerLimit !== null
        ? t('gpu.powerValue', { power: Math.round(power), limit: Math.round(powerLimit) })
        : power !== null ? t('gpu.powerShort', { power: Math.round(power) }) : '—';
      const coreClock = numberOrNull(gpu?.coreClockMhz);
      const memoryClock = numberOrNull(gpu?.memoryClockMhz);
      const clockText = coreClock !== null && memoryClock !== null
        ? t('gpu.clockValue', { core: Math.round(coreClock), memory: Math.round(memoryClock) })
        : '—';
      const temperature = numberOrNull(gpu?.temperatureCelsius);
      return h('section', { className: 'lm-card', 'aria-label': t('gpu.title') }, [
        h(CardHead, { key: 'head', title: t('gpu.title'), hint, hintTitle: hint }),
        h('div', { key: 'bars', className: 'lm-gpuBars' }, [
          h(MiniBar, { key: 'usage', label: t('gpu.utilization'), value: formatPercent(usage), width: usage, color: 'var(--lm-amber)' }),
          h(MiniBar, { key: 'vram', label: t('gpu.vram'), value: vramText, width: vramPct, color: 'var(--lm-amber)' }),
          h(MiniBar, { key: 'power', label: t('gpu.power'), value: powerText, width: powerPct, color: 'var(--lm-amber)' }),
          h(MiniBar, { key: 'fan', label: t('gpu.fan'), value: fanText, width: fanWidth, color: 'var(--lm-amber)' }),
        ]),
        h('div', { key: 'rows', className: 'lm-rows' }, [
          h(KvRow, { key: 'driver', label: t('gpu.driver'), value: textOrNull(gpu?.driverVersion) ?? '—' }),
          h(KvRow, { key: 'cuda', label: t('gpu.cuda'), value: textOrNull(gpu?.cudaVersion) ?? '—' }),
          h(KvRow, { key: 'clocks', label: t('gpu.clocks'), value: clockText }),
          h(KvRow, { key: 'temp', label: t('gpu.temp'), value: temperature === null ? '—' : Math.round(temperature) + '°C' }),
        ]),
      ]);
    }

    /**
     * The disk-usage card.
     * @param props - Disk rows and I/O block.
     * @returns The card element.
     */
    function DiskCard(props) {
      const t = props.t;
      const windows = props.platform === 'win32';
      const disks = Array.isArray(props.disks) ? props.disks : [];
      const read = formatRate(props.diskIO?.readBytesPerSecond);
      const write = formatRate(props.diskIO?.writeBytesPerSecond);
      const hint = read === null && write === null
        ? t('disk.ioUnavailable')
        : t('disk.io', { read: read ?? '—', write: write ?? '—' });
      return h('section', { className: 'lm-card', 'aria-label': t('disk.title') }, [
        h(CardHead, { key: 'head', title: t('disk.title'), hint }),
        disks.length === 0
          ? h('div', { className: 'lm-empty' }, t('disk.empty'))
          : h('div', { key: 'list', className: 'lm-diskList' }, disks.map((disk, diskIndex) => {
            const usage = percentOrNull(disk?.usage);
            const used = formatBytes(disk?.usedBytes);
            const total = formatBytes(disk?.totalBytes);
            const fs = textOrNull(disk?.fs);
            const device = textOrNull(disk?.device);
            const mount = textOrNull(disk?.mount);
            const volume = textOrNull(disk?.label);
            const label = windows ? (mount ?? volume ?? '—') : (volume ?? mount ?? '—');
            const subParts = windows ? [fs, volume] : [fs, device !== label ? device : null];
            const sub = subParts.filter(Boolean).join(' · ');
            return h('div', { key: 'disk' + diskIndex + ':' + (disk.mount ?? '') + (disk.device ?? ''), className: 'lm-disk' }, [
              h('div', { key: 'head', className: 'lm-diskHead' }, [
                h('span', { key: 'name', className: 'lm-diskName' }, [
                  h('span', { key: 'mount' }, label),
                  sub === '' ? null : h('span', { key: 'fs', className: 'lm-diskFs' }, sub),
                ]),
                h('span', { key: 'value', className: 'lm-diskValue' }, [
                  used ?? '—',
                  ' / ',
                  total ?? '—',
                  usage === null ? '' : ' · ' + Math.round(usage) + '%',
                ]),
              ]),
              h('div', { key: 'bar', className: 'lm-track' }, h('div', {
                className: 'lm-fill',
                style: { width: (usage === null ? 0 : usage) + '%', background: 'var(--lm-blue)' },
              })),
            ]);
          })),
      ]);
    }

    /**
     * One download/upload tile.
     * @param props - Label, value, unit, and direction.
     * @returns The tile element.
     */
    function NetTile(props) {
      const arrow = h('svg', {
        key: 'arrow',
        width: 14,
        height: 14,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      }, props.up
        ? [h('path', { key: 'a', d: 'M12 19V5' }), h('path', { key: 'b', d: 'M6 11l6-6 6 6' })]
        : [h('path', { key: 'a', d: 'M12 5v14' }), h('path', { key: 'b', d: 'M6 13l6 6 6-6' })]);
      return h('div', { className: 'lm-netTile' }, [
        h('span', { key: 'label', className: 'lm-netTileLabel' }, [arrow, props.label]),
        h('span', { key: 'value', className: 'lm-netTileValue' }, [
          props.value ?? '—',
          props.unit === null || props.unit === undefined
            ? null
            : h('span', { key: 'unit', className: 'lm-netTileUnit' }, ' ' + props.unit),
        ]),
      ]);
    }

    /**
     * The network card.
     * @param props - Network block and translate function.
     * @returns The card element.
     */
    function NetworkCard(props) {
      const t = props.t;
      const network = props.network;
      const iface = textOrNull(network?.interface);
      const link = formatLinkSpeed(network?.linkSpeedMbps);
      const hint = iface === null ? t('net.empty') : link === null ? iface : iface + ' · ' + link;
      const [downValue, downUnit] = splitRate(network?.downBytesPerSecond);
      const [upValue, upUnit] = splitRate(network?.upBytesPerSecond);
      return h('section', { className: 'lm-card', 'aria-label': t('net.title') }, [
        h(CardHead, { key: 'head', title: t('net.title'), hint }),
        h('div', { key: 'speed', className: 'lm-netSpeed' }, [
          h(NetTile, { key: 'down', label: t('net.download'), value: downValue, unit: downUnit, up: false }),
          h(NetTile, { key: 'up', label: t('net.upload'), value: upValue, unit: upUnit, up: true }),
        ]),
        h('div', { key: 'rows', className: 'lm-rows' }, [
          h(KvRow, { key: 'ip', label: t('net.ipv4'), value: textOrNull(network?.ipv4) ?? '—' }),
          h(KvRow, { key: 'rx', label: t('net.received'), value: formatBytes(network?.receivedBytes) ?? '—' }),
          h(KvRow, { key: 'tx', label: t('net.sent'), value: formatBytes(network?.transmittedBytes) ?? '—' }),
        ]),
      ]);
    }

    /**
     * The temperature and fan card.
     * @param props - Sensor rows, fan, and translate function.
     * @returns The card element.
     */
    function SensorsCard(props) {
      const t = props.t;
      const sensors = Array.isArray(props.sensors) ? props.sensors : [];
      const fan = props.fan;
      const allTemperatures = sensors
        .map((sensor) => numberOrNull(sensor?.celsius))
        .filter((value) => value !== null);
      const hot = allTemperatures.some((value) => value >= 80);
      const readable = sensors.length > 0 || (fan !== null && fan !== undefined);
      const state = !readable
        ? t('sensors.unavailable')
        : hot ? t('sensors.hot') : t('sensors.normal');
      const stateColor = !readable
        ? 'var(--lm-muted)'
        : hot ? 'var(--lm-red-text)' : 'var(--lm-green-text)';
      const sensorLabel = (sensor) => {
        const key = sensor?.key;
        const raw = textOrNull(sensor?.label);
        if (key === 'cpu' || key === 'gpu' || key === 'nvme' || key === 'board') return t('sensors.' + key);
        if (key === 'other') return raw ?? t('sensors.other');
        return raw ?? textOrNull(key) ?? t('unknown');
      };
      const fanLabel = textOrNull(fan?.label) ?? t('sensors.fan');
      const fanRpm = numberOrNull(fan?.rpm);
      const fanMax = numberOrNull(fan?.maxRpm);
      const fanWidth = fanRpm === null ? null : Math.min(100, (fanRpm / (fanMax === null || fanMax <= 0 ? 3000 : fanMax)) * 100);
      return h('section', { className: 'lm-card', 'aria-label': t('sensors.title') }, [
        h('div', { key: 'head', className: 'lm-row', style: { paddingTop: 0, borderTop: 0 } }, [
          h('h2', { key: 'title', style: { margin: 0, fontSize: 16, fontWeight: 600 } }, t('sensors.title')),
          h('span', { key: 'state', style: { color: stateColor, fontSize: 12 } }, state),
        ]),
        readable
          ? h('div', { key: 'list', className: 'lm-sensorList' }, [
            ...sensors.map((sensor, index) => {
              const celsius = numberOrNull(sensor?.celsius);
              const color = celsius === null ? 'var(--lm-muted)' : celsius >= 80 ? 'var(--lm-red)' : celsius >= 65 ? 'var(--lm-amber)' : 'var(--lm-green)';
              return h('div', { key: 'sensor' + index, className: 'lm-sensorRow' }, [
                h('span', { key: 'label', className: 'lm-sensorLabel', title: sensorLabel(sensor) }, sensorLabel(sensor)),
                h('div', { key: 'bar', className: 'lm-track', style: { height: 6 } }, h('div', {
                  className: 'lm-fill',
                  style: { width: (celsius === null ? 0 : Math.min(100, celsius)) + '%', background: color },
                })),
                h('span', { key: 'value', className: 'lm-sensorValue' }, celsius === null ? '—' : Math.round(celsius) + '°C'),
              ]);
            }),
            fanRpm === null
              ? null
              : h('div', { key: 'fan', className: 'lm-sensorRow' }, [
                h('span', { key: 'label', className: 'lm-sensorLabel', title: fanLabel }, fanLabel),
                h('div', { key: 'bar', className: 'lm-track', style: { height: 6 } }, h('div', {
                  className: 'lm-fill',
                  style: { width: (fanWidth === null ? 0 : fanWidth) + '%', background: 'var(--lm-core-e)' },
                })),
                h('span', { key: 'value', className: 'lm-sensorValue' }, Math.round(fanRpm) + ' rpm'),
              ]),
          ])
          : h('div', { key: 'empty', className: 'lm-empty' }, t('sensors.empty')),
      ]);
    }

    /**
     * The top-process table.
     * @param props - Process block and translate function.
     * @returns The card element.
     */
    function ProcessCard(props) {
      const t = props.t;
      const processes = props.processes;
      const total = numberOrNull(processes?.total);
      const threads = numberOrNull(processes?.threads);
      const summary = total === null
        ? ''
        : threads === null
          ? t('proc.summaryNoThreads', { processes: formatCount(total) })
          : t('proc.summary', { processes: formatCount(total), threads: formatCount(threads) });
      const rows = Array.isArray(processes?.top) ? processes.top : [];
      const cpuValues = rows
        .map((process) => numberOrNull(process?.cpuPercent))
        .filter((value) => value !== null);
      const cpuScale = Math.max(4, cpuValues.length === 0 ? 0 : Math.max(...cpuValues));
      return h('section', { className: 'lm-card lm-processCard', 'aria-label': t('proc.title') }, [
        h(CardHead, { key: 'head', title: t('proc.title'), hint: summary }),
        h('div', { key: 'wrap', className: 'lm-tableWrap' }, h('table', { className: 'lm-table' }, [
          h('thead', { key: 'head' }, h('tr', null, [
            h('th', { key: 'name' }, t('proc.name')),
            h('th', { key: 'pid' }, t('proc.pid')),
            h('th', { key: 'user' }, t('proc.user')),
            h('th', { key: 'cpu', style: { width: 220 } }, t('proc.cpu')),
            h('th', { key: 'mem', style: { textAlign: 'right' } }, t('proc.mem')),
            h('th', { key: 'vram' }, t('proc.vram')),
          ])),
          h('tbody', { key: 'body' }, rows.length === 0
            ? h('tr', null, h('td', { colSpan: 6 }, h('div', { className: 'lm-empty' }, t('proc.empty'))))
            : rows.map((process, index) => {
              const cpuPercent = numberOrNull(process?.cpuPercent);
              const width = cpuPercent === null
                ? 0
                : Math.min(100, Math.max(cpuPercent > 0 ? 2 : 0, (cpuPercent / cpuScale) * 100));
              const name = textOrNull(process?.name) ?? t('unknown');
              const user = textOrNull(process?.user) ?? '—';
              return h('tr', { key: (process?.pid ?? '') + ':' + index }, [
                h('td', { key: 'name' }, h('span', { className: 'lm-procName', title: name }, name)),
                h('td', { key: 'pid', className: 'lm-procMuted' }, numberOrNull(process?.pid) ?? '—'),
                h('td', { key: 'user', className: 'lm-procMuted' }, user),
                h('td', { key: 'cpu' }, h('div', { className: 'lm-cpuCell' }, [
                  h('div', { key: 'bar', className: 'lm-track lm-cpuTrack' }, h('div', {
                    className: 'lm-fill',
                    style: { width: width + '%', background: 'var(--lm-ink)' },
                  })),
                  h('span', { key: 'value', className: 'lm-cpuValue' }, cpuPercent === null ? '—' : cpuPercent.toFixed(1) + '%'),
                ])),
                h('td', { key: 'mem', style: { textAlign: 'right' } }, formatBytes(process?.memoryBytes) ?? '—'),
                h('td', { key: 'vram', style: { color: 'var(--lm-ink-2)' } }, formatBytes(process?.gpuMemoryBytes) ?? '—'),
              ]);
            })),
        ])),
      ]);
    }

    /**
     * Format a duration in milliseconds for the session and thread cards.
     * @param ms - Duration or null.
     * @returns `840 ms` / `12.4 s` / `3.2 min`, or null.
     */
    function formatDuration(ms) {
      const value = numberOrNull(ms);
      if (value === null || value < 0) return null;
      if (value < 1000) return Math.round(value) + ' ms';
      if (value < 60_000) return (value / 1000).toFixed(1) + ' s';
      return (value / 60_000).toFixed(1) + ' min';
    }

    /**
     * Format a compact token count (`12.3K`, `1.4M`).
     * @param value - Token count or null.
     * @returns Display string or null.
     */
    function formatTokens(value) {
      const count = numberOrNull(value);
      if (count === null || count < 0) return null;
      if (count < 1000) return String(Math.round(count));
      if (count < 1_000_000) return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
      return (count / 1_000_000).toFixed(2).replace(/0$/, '').replace(/\.$/, '') + 'M';
    }

    /**
     * Format a percentage without forcing a decimal.
     * @param value - Percentage or null.
     * @returns Display string.
     */
    function formatPercentValue(value) {
      const parsed = numberOrNull(value);
      if (parsed === null) return '—';
      const rounded = Math.round(parsed * 10) / 10;
      return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)) + '%';
    }

    /**
     * Read the localized label of one harness process role.
     * @param t - Translate function.
     * @param role - Role slug.
     * @returns Human label.
     */
    function roleLabel(t, role) {
      const key = 'harness.role.' + (textOrNull(role) ?? 'other');
      const label = t(key);
      return label === key ? t('harness.role.other') : label;
    }

    /**
     * One label/value pair inside a harness or session grid.
     * @param props - Label, value, and an optional title.
     * @returns The field element.
     */
    function Field(props) {
      return h('div', { className: 'lm-sessionField' }, [
        h('span', { key: 'label', className: 'lm-sessionFieldLabel' }, props.label),
        h('span', { key: 'value', className: 'lm-sessionFieldValue', title: props.title ?? props.value }, props.value),
      ]);
    }

    /**
     * One labelled progress bar with its value text.
     * @param props - Label value text, width percentage, color, and hint.
     * @returns The bar block.
     */
    function SessionBar(props) {
      const width = percentOrNull(props.width);
      return h('div', { className: 'lm-sessionBar' }, [
        h('div', { key: 'head', className: 'lm-sessionBarHead' }, [
          h('span', { key: 'label' }, props.label),
          h('span', { key: 'value', title: props.hint }, props.value),
        ]),
        h('div', { key: 'track', className: 'lm-track', style: { height: 6 } }, h('div', {
          className: 'lm-fill',
          style: { width: (width === null ? 0 : width) + '%', background: props.color },
        })),
      ]);
    }

    /**
     * The Host runtime card: JavaScript heap, event-loop delay, active handles,
     * context switches, and the busiest Host threads.
     * @param props - Harness block and translate function.
     * @returns The card element.
     */
    function HostRuntimeCard(props) {
      const t = props.t;
      const host = props.harness?.host ?? null;
      if (host === null) {
        return h('section', { className: 'lm-card lm-harnessCard', 'aria-label': t('harness.hostTitle') }, [
          h(CardHead, { key: 'head', title: t('harness.hostTitle'), hint: t('unavailable') }),
          h('div', { className: 'lm-empty' }, t('harness.unavailable')),
        ]);
      }
      const heap = host.heap ?? null;
      const heapUsage = percentOrNull(heap?.usage);
      const loop = host.eventLoop ?? null;
      const handles = host.handles ?? null;
      const usage = host.resourceUsage ?? null;
      const threads = host.threads ?? null;
      const versions = host.versions ?? null;
      const threadRows = Array.isArray(threads?.top) ? threads.top : [];
      const byType = handles?.byType === null || handles?.byType === undefined
        ? []
        : Object.entries(handles.byType).sort((left, right) => right[1] - left[1]).slice(0, 3);
      const handleTypes = byType.map(([name, count]) => name + ' ×' + count).join(', ');
      const loopValue = loop === null || loop.meanMs === null
        ? '—'
        : t('harness.eventLoopValue', {
          mean: (loop.meanMs ?? 0).toFixed(1) + ' ms',
          p99: loop.p99Ms === null ? '—' : loop.p99Ms.toFixed(1) + ' ms',
        });
      const switches = usage === null
        ? '—'
        : formatCount(usage.voluntaryContextSwitches ?? 0) + ' / ' + formatCount(usage.involuntaryContextSwitches ?? 0);
      return h('section', { className: 'lm-card lm-harnessCard', 'aria-label': t('harness.hostTitle') }, [
        h(CardHead, {
          key: 'head',
          title: t('harness.hostTitle'),
          hint: 'PID ' + (host.pid ?? '—') + ' · ' + (formatUptime(host.uptimeSeconds, t) ?? '—'),
        }),
        h('div', { key: 'heap', className: 'lm-split', style: { flexDirection: 'column', gap: 8 } }, [
          h(SessionBar, {
            key: 'heap',
            label: t('harness.heap'),
            value: heap === null
              ? '—'
              : t('harness.heapUsage', {
                used: formatBytes(heap.usedBytes) ?? '—',
                total: formatBytes(heap.totalBytes) ?? '—',
              }),
            width: heapUsage,
            color: 'var(--lm-green)',
          }),
        ]),
        h('div', { key: 'grid', className: 'lm-hostGrid' }, [
          h(Field, { key: 'loop', label: t('harness.eventLoop'), value: loopValue }),
          h(Field, {
            key: 'handles',
            label: t('harness.handles'),
            value: handles === null
              ? '—'
              : t('harness.handlesValue', { count: formatCount(handles.active), types: handleTypes === '' ? '—' : handleTypes }),
            title: handleTypes,
          }),
          h(Field, { key: 'switches', label: t('harness.contextSwitches'), value: switches }),
          h(Field, {
            key: 'versions',
            label: t('harness.versions'),
            value: ['Node ' + (versions?.node ?? '—'), 'V8 ' + (versions?.v8 ?? '—')].join(' · '),
          }),
        ]),
        h('div', { key: 'threads', className: 'lm-threadList' }, [
          h('span', { key: 'title', className: 'lm-sessionFieldLabel' }, t('harness.topThreads')),
          threadRows.length === 0
            ? h('div', { key: 'empty', className: 'lm-empty', style: { padding: '6px 0' } }, t('harness.noThreads'))
            : threadRows.map((thread) => h('div', { key: 'thread' + thread.tid, className: 'lm-threadRow' }, [
              h('span', { key: 'name', className: 'lm-threadName', title: thread.name }, thread.name),
              h('div', { key: 'bar', className: 'lm-track', style: { height: 6 } }, h('div', {
                className: 'lm-fill',
                style: {
                  width: Math.min(100, Math.max(thread.cpuPercent > 0 ? 2 : 0, thread.cpuPercent ?? 0)) + '%',
                  background: 'var(--lm-ink)',
                },
              })),
              h('span', { key: 'cpu', className: 'lm-threadCpu' }, formatPercentValue(thread.cpuPercent)),
            ])),
        ]),
      ]);
    }

    /**
     * The Harness process-tree card.
     * @param props - Harness block, system totals, and translate function.
     * @returns The card element.
     */
    function HarnessCard(props) {
      const t = props.t;
      const harness = props.harness;
      const rows = Array.isArray(harness?.processes) ? harness.processes : [];
      const totals = harness?.totals ?? null;
      const cpuCores = numberOrNull(props.cpuCores);
      const systemMemory = numberOrNull(props.systemMemory);
      const cpuShare = totals?.cpuPercent !== null && totals?.cpuPercent !== undefined && cpuCores !== null && cpuCores > 0
        ? totals.cpuPercent / cpuCores
        : null;
      const memoryShare = totals?.memoryBytes !== null && totals?.memoryBytes !== undefined && systemMemory !== null && systemMemory > 0
        ? (totals.memoryBytes / systemMemory) * 100
        : null;
      const available = harness?.available === true;
      const hint = available
        ? [
          t('harness.processes', { count: formatCount(totals?.processCount ?? rows.length) }),
          totals?.threads === null || totals?.threads === undefined
            ? null
            : t('harness.threads', { count: formatCount(totals.threads) }),
        ].filter(Boolean).join(' · ')
        : t('harness.unavailable');
      const maxCpu = Math.max(4, ...rows.map((row) => numberOrNull(row?.cpuPercent) ?? 0));
      const chips = available
        ? [
          {
            key: 'cpu',
            label: t('harness.totalCpu'),
            value: formatPercentValue(cpuShare ?? totals?.cpuPercent),
            title: cpuShare === null ? null : t('harness.cpuShare', { value: formatPercentValue(cpuShare) }),
          },
          {
            key: 'memory',
            label: t('harness.totalMemory'),
            value: formatBytes(totals?.memoryBytes) ?? '—',
            title: memoryShare === null ? null : t('harness.memoryShare', { value: formatPercentValue(memoryShare) }),
          },
          {
            key: 'io',
            label: t('harness.totalIo'),
            value: t('harness.io', {
              read: formatRate(totals?.readBytesPerSecond) ?? '—',
              write: formatRate(totals?.writeBytesPerSecond) ?? '—',
            }),
            title: null,
          },
        ]
        : [];
      return h('section', { className: 'lm-card lm-harnessCard', 'aria-label': t('harness.title') }, [
        h('div', { key: 'head', className: 'lm-harnessHead' }, [
          h('div', { key: 'title', className: 'lm-harnessTitle' }, [
            h('h2', { key: 'h2' }, t('harness.title')),
            h('p', { key: 'p' }, t('harness.subtitle')),
          ]),
          h('div', { key: 'stats', className: 'lm-harnessStats' }, [
            h('span', { key: 'hint', className: 'lm-hint' }, hint),
            ...chips.map((chip) => h('span', {
              key: chip.key,
              className: 'lm-statChip',
              title: chip.title ?? chip.value,
            }, [
              h('span', { key: 'label', className: 'lm-statChipLabel' }, chip.label),
              h('span', { key: 'value', className: 'lm-statChipValue' }, chip.value),
            ])),
          ]),
        ]),
        available
          ? h('div', { key: 'wrap', className: 'lm-tableWrap' }, h('table', { className: 'lm-table lm-harnessTable' }, [
            h('thead', { key: 'head' }, h('tr', null, [
              h('th', { key: 'name' }, t('proc.name')),
              h('th', { key: 'role' }, t('harness.role')),
              h('th', { key: 'pid' }, t('harness.pid')),
              h('th', { key: 'cpu', style: { width: 180 } }, t('proc.cpu')),
              h('th', { key: 'rss', style: { textAlign: 'right' } }, t('harness.rss')),
              h('th', { key: 'swap', style: { textAlign: 'right' } }, t('harness.swap')),
              h('th', { key: 'threads', style: { textAlign: 'right' } }, t('harness.threadsCol')),
              h('th', { key: 'io' }, t('harness.io')),
              h('th', { key: 'fd', style: { textAlign: 'right' } }, t('harness.fd')),
            ])),
            h('tbody', { key: 'body' }, rows.map((row, index) => {
              const cpuPercent = numberOrNull(row?.cpuPercent);
              const width = cpuPercent === null
                ? 0
                : Math.min(100, Math.max(cpuPercent > 0 ? 2 : 0, (cpuPercent / maxCpu) * 100));
              const name = textOrNull(row?.name) ?? t('unknown');
              const command = textOrNull(row?.command);
              return h('tr', { key: (row?.pid ?? '') + ':' + index }, [
                h('td', { key: 'name' }, h('div', { className: 'lm-harnessName' }, [
                  h('span', { key: 'text', className: 'lm-harnessNameText' }, [
                    h('span', { key: 'name' }, name),
                    row?.isHost === true ? h('span', { key: 'self', className: 'lm-selfTag' }, t('harness.self')) : null,
                  ]),
                  command === null ? null : h('span', { key: 'cmd', className: 'lm-harnessCmd', title: command }, command),
                ])),
                h('td', { key: 'role' }, h('span', {
                  className: 'lm-roleBadge',
                  'data-role': textOrNull(row?.role) ?? 'other',
                }, roleLabel(t, row?.role))),
                h('td', { key: 'pid', className: 'lm-procMuted' }, numberOrNull(row?.pid) ?? '—'),
                h('td', { key: 'cpu' }, h('div', { className: 'lm-cpuCell' }, [
                  h('div', { key: 'bar', className: 'lm-track lm-cpuTrack' }, h('div', {
                    className: 'lm-fill',
                    style: { width: width + '%', background: 'var(--lm-ink)' },
                  })),
                  h('span', { key: 'value', className: 'lm-cpuValue' }, formatPercentValue(cpuPercent)),
                ])),
                h('td', { key: 'rss', style: { textAlign: 'right' } }, formatBytes(row?.memoryBytes) ?? '—'),
                h('td', { key: 'swap', style: { textAlign: 'right' } }, formatBytes(row?.swapBytes) ?? '—'),
                h('td', { key: 'threads', style: { textAlign: 'right' } }, formatCount(row?.threads) ),
                h('td', { key: 'io' }, t('harness.io', {
                  read: formatRate(row?.readBytesPerSecond) ?? '—',
                  write: formatRate(row?.writeBytesPerSecond) ?? '—',
                })),
                h('td', { key: 'fd', style: { textAlign: 'right' } }, formatCount(row?.fileDescriptors)),
              ]);
            })),
          ]))
          : h('div', { key: 'empty', className: 'lm-empty' }, [
            h('div', { key: 'title' }, t('harness.unavailable')),
            h('div', { key: 'hint', style: { fontSize: 11, marginTop: 2 } }, t('harness.unavailableHint')),
          ]),
      ]);
    }

    /**
     * The live-session card: one block per Host session with its attributed
     * process hardware use and its transcript accounting.
     * @param props - Harness block and translate function.
     * @returns The card element.
     */
    function SessionCard(props) {
      const t = props.t;
      const harness = props.harness;
      const sessions = Array.isArray(harness?.sessions) ? harness.sessions : [];
      const available = harness !== null && harness !== undefined;
      const attribution = textOrNull(harness?.attribution);
      const hint = !available
        ? t('session.unavailable')
        : sessions.length === 0 ? t('session.empty') : t('session.subtitle');
      return h('section', { className: 'lm-card lm-harnessCard', 'aria-label': t('session.title') }, [
        h('div', { key: 'head', className: 'lm-harnessHead' }, [
          h('div', { key: 'title', className: 'lm-harnessTitle' }, [
            h('h2', { key: 'h2' }, t('session.title')),
            h('p', { key: 'p' }, hint),
          ]),
          h('div', { key: 'stats', className: 'lm-harnessStats' }, [
            attribution === null
              ? null
              : h('span', {
                key: 'attr',
                className: 'lm-statChip',
                title: t('session.attribution.' + attribution),
              }, [
                h('span', { key: 'label', className: 'lm-statChipLabel' }, t('session.attributed')),
                h('span', { key: 'value', className: 'lm-statChipValue' }, t('session.attribution.' + attribution)),
              ]),
          ]),
        ]),
        sessions.length === 0
          ? h('div', { key: 'empty', className: 'lm-empty' }, [
            h('div', { key: 'title' }, t('session.empty')),
            h('div', { key: 'hint', style: { fontSize: 11, marginTop: 2 } }, t('session.emptyHint')),
          ])
          : h('div', { key: 'list', className: 'lm-sessionList' }, sessions.map((session) => {
            const sessionId = textOrNull(session?.sessionId) ?? '—';
            const title = textOrNull(session?.title) ?? sessionId;
            const running = session?.running === true;
            const tokens = session?.tokens ?? null;
            const context = session?.context ?? null;
            const stats = session?.stats ?? null;
            const processCount = numberOrNull(session?.processCount) ?? 0;
            const threads = numberOrNull(session?.threads);
            const contextUsage = percentOrNull(context?.usage);
            const contextValue = context === null || context.windowTokens === null
              ? t('session.contextUnknown')
              : t('session.contextValue', {
                used: formatTokens(context.projectedTokens ?? context.usedTokens) ?? '—',
                window: formatTokens(context.windowTokens) ?? '—',
              });
            const pids = Array.isArray(session?.pids) ? session.pids : [];
            return h('div', {
              key: sessionId,
              className: 'lm-session',
              'data-running': running ? 'true' : 'false',
            }, [
              h('div', { key: 'head', className: 'lm-sessionHead' }, [
                h('div', { key: 'title', className: 'lm-sessionTitle' }, [
                  h('div', { key: 'name', className: 'lm-sessionName' }, [
                    h('span', { key: 'text', className: 'lm-sessionNameText', title: title }, title),
                    h('span', {
                      key: 'live',
                      className: 'lm-roleBadge',
                      'data-role': session?.live === false ? 'other' : 'host',
                    }, session?.live === false ? t('session.persisted') : t('session.live')),
                  ]),
                  h('span', { key: 'id', className: 'lm-sessionId', title: sessionId }, sessionId),
                ]),
                h('span', { key: 'state', className: 'lm-sessionState', 'data-running': running ? 'true' : 'false' }, [
                  h('span', { key: 'dot', className: 'lm-sessionStateDot', 'aria-hidden': 'true' }),
                  running ? t('session.running') : t('session.idle'),
                ]),
              ]),
              h('div', { key: 'grid', className: 'lm-sessionGrid' }, [
                h(Field, {
                  key: 'cpu',
                  label: t('proc.cpu'),
                  value: formatPercentValue(session?.cpuPercent),
                }),
                h(Field, {
                  key: 'memory',
                  label: t('harness.rss'),
                  value: formatBytes(session?.memoryBytes) ?? '—',
                }),
                h(Field, {
                  key: 'io',
                  label: t('harness.io'),
                  value: t('harness.io', {
                    read: formatRate(session?.readBytesPerSecond) ?? '—',
                    write: formatRate(session?.writeBytesPerSecond) ?? '—',
                  }),
                }),
                h(Field, {
                  key: 'processes',
                  label: t('session.attributed'),
                  value: processCount === 0
                    ? t('session.noProcess')
                    : t('session.processes', { count: formatCount(processCount), threads: formatCount(threads ?? 0) }),
                  title: pids.length === 0 ? null : t('session.pids', { pids: pids.join(', ') }),
                }),
                h(Field, {
                  key: 'tokens',
                  label: t('session.tokens'),
                  value: tokens === null
                    ? '—'
                    : t('session.tokensValue', {
                      input: formatTokens(tokens.inputTokens) ?? '—',
                      output: formatTokens(tokens.outputTokens) ?? '—',
                    }),
                  title: tokens?.totalTokens === null || tokens?.totalTokens === undefined
                    ? null
                    : formatTokens(tokens.totalTokens) + ' total',
                }),
                h(Field, {
                  key: 'stats',
                  label: t('session.stats'),
                  value: stats === null
                    ? '—'
                    : t('session.statsValue', {
                      turns: formatCount(stats.turns ?? 0),
                      steps: formatCount(stats.steps ?? 0),
                    }),
                  title: stats === null ? null : [
                    t('session.llmTime', { value: formatDuration(stats.llmMs) ?? '—' }),
                    t('session.toolTime', { value: formatDuration(stats.toolMs) ?? '—' }),
                  ].join(' · '),
                }),
                h(Field, {
                  key: 'log',
                  label: t('session.logBytes'),
                  value: formatBytes(session?.logBytes) ?? '—',
                  title: session?.logBytesPerSecond === null || session?.logBytesPerSecond === undefined
                    ? null
                    : t('session.logGrowth', { value: formatBytes(session.logBytesPerSecond) ?? '—' }),
                }),
                h(Field, {
                  key: 'events',
                  label: t('session.messages'),
                  value: formatCount(session?.events),
                }),
              ]),
              h(SessionBar, {
                key: 'context',
                label: t('session.context'),
                value: contextValue,
                width: contextUsage,
                color: contextUsage !== null && contextUsage >= 85 ? 'var(--lm-red)' : 'var(--lm-blue)',
              }),
              h('div', { key: 'foot', className: 'lm-sessionFoot' }, [
                h('span', { key: 'cwd', className: 'lm-mono', title: textOrNull(session?.cwd) ?? '' },
                  textOrNull(session?.cwd) ?? '—'),
                session?.vramBytes === null || session?.vramBytes === undefined
                  ? null
                  : h('span', { key: 'vram' }, t('gpu.vramLine', { value: formatBytes(session.vramBytes) ?? '—' })),
              ]),
            ]);
          })),
      ]);
    }

    /**
     * Sidebar glyph: a display with usage bars.
     * @param props - Panel icon props from the sidebar.
     * @returns The icon element.
     */
    function LocalMachineIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 18;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      }, [
        h('rect', { key: 'screen', x: 3, y: 4.5, width: 18, height: 12, rx: 2 }),
        h('path', { key: 'stand', d: 'M12 16.5v3.5M8.5 20h7' }),
        h('path', { key: 'bar1', d: 'M7.6 13v-2.4' }),
        h('path', { key: 'bar2', d: 'M12 13V8.9' }),
        h('path', { key: 'bar3', d: 'M16.4 13v-4' }),
      ]);
    }

    /**
     * The global panel page.
     * @param props - Slot props (locale binding among them).
     * @returns The panel element.
     */
    function LocalMachinePage(props) {
      const t = translateOf(props);
      const snapshot = useSnapshot();
      const [intervalMs, setIntervalMs] = React.useState(2000);
      const data = snapshot.data;
      const platform = typeof data?.platform === 'string' ? data.platform : null;
      const hostSchema = numberOrNull(data?.schemaVersion);
      const legacyHost = data !== null
        && typeof data === 'object'
        && (hostSchema === null || data.os === undefined || hostSchema < REQUIRED_SCHEMA);
      const os = data?.os ?? (data === null ? null : { name: platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux', release: null });
      const cpu = data?.cpu ?? null;
      const memory = data?.memory ?? null;
      const gpu = data?.gpu ?? null;
      const disks = Array.isArray(data?.disks) ? data.disks : [];
      const sensors = Array.isArray(data?.sensors) ? data.sensors : [];
      const fan = data?.fan ?? null;
      const processes = data?.processes ?? null;
      const network = data?.network ?? null;
      const diskIO = data?.diskIO ?? null;
      const harness = data?.harness ?? null;
      const status = snapshot.error !== null
        ? 'error'
        : intervalMs === 0 && !snapshot.loading ? 'paused' : 'collecting';
      const statusText = status === 'error'
        ? t('status.error')
        : status === 'paused' ? t('status.paused') : t('status.collecting');
      const updated = snapshot.at === null ? t('never') : t('updated', { time: formatClock(snapshot.at) });
      const osLabel = textOrNull(os?.name) ?? t('unknown');
      const osRelease = legacyHost
        ? t('legacy.release')
        : textOrNull(os?.release) ?? t('os.unknown');
      const kernelLabel = platform === 'win32' ? t('os.version') : t('os.kernel');
      const kernelValue = platform === 'win32'
        ? (textOrNull(os?.version) ?? textOrNull(os?.kernel) ?? '—')
        : (textOrNull(os?.kernel) ?? '—');
      const desktopRaw = textOrNull(os?.desktop);
      const desktopValue = platform === 'win32' && desktopRaw === 'Explorer'
        ? t('os.explorer')
        : desktopRaw ?? '—';
      const desktopLabel = platform === 'win32'
        ? t('os.shell')
        : platform === 'darwin' ? t('os.desktopShort') : t('os.desktop');
      const uptimeValue = formatUptime(os?.uptimeSeconds, t) ?? '—';
      const bootValue = formatDateTime(os?.bootTime) ?? '—';
      const sysFields = [
        { key: 'kernel', label: kernelLabel, value: kernelValue },
        { key: 'host', label: platform === 'win32' ? t('os.computerName') : t('os.hostname'), value: textOrNull(os?.hostname) ?? '—' },
        { key: 'arch', label: t('os.arch'), value: textOrNull(os?.arch) ?? '—' },
        { key: 'desktop', label: desktopLabel, value: desktopValue },
        { key: 'uptime', label: t('os.uptime'), value: uptimeValue },
        { key: 'boot', label: t('os.boot'), value: bootValue },
      ];
      const threads = numberOrNull(cpu?.threads) ?? numberOrNull(cpu?.cores);
      const frequency = formatFrequency(cpu?.baseFrequencyMhz ?? cpu?.frequencyMhz);
      const loadFirst = Array.isArray(cpu?.loadAverage) ? numberOrNull(cpu.loadAverage[0]) : numberOrNull(cpu?.load);
      const cpuBits = [
        threads === null ? null : t('cpu.threads', { count: formatCount(threads) }),
        frequency,
        loadFirst === null ? null : t('cpu.load1', { value: loadFirst.toFixed(2) }),
      ].filter(Boolean);
      const cpuModel = cleanCpuModel(cpu?.model) ?? t('unknown');
      const memUsed = numberOrNull(memory?.usedBytes);
      const memTotal = numberOrNull(memory?.totalBytes);
      const memAvailable = numberOrNull(memory?.availableBytes);
      const gpuAvailable = gpu?.available === true;
      const gpuUsage = gpuAvailable ? percentOrNull(gpu?.usage) : null;
      const gpuVramUsed = numberOrNull(gpu?.memoryUsedBytes);
      const gpuVramTotal = numberOrNull(gpu?.memoryTotalBytes);
      const gpuName = textOrNull(gpu?.name);
      const gpuReason = gpu !== null && gpu !== undefined && gpu.available !== true
        ? (gpu.reason === 'driver-unavailable'
          ? t('gpu.driverUnavailable')
          : gpu.reason === 'unsupported' ? t('gpu.unsupported') : gpuName === null ? t('gpu.none') : t('gpu.unsupported'))
        : null;
      const gpuMeta = gpuName === null ? t('gpu.none') : shortGpuName(gpuName) ?? gpuName;
      const gpuHint = gpuAvailable && gpuVramUsed !== null && gpuVramTotal !== null
        ? t('gpu.vramLine', { value: (formatBytes(gpuVramUsed) ?? '—') + ' / ' + (formatGpuTotal(gpuVramTotal) ?? '—') })
        : gpuReason ?? (gpuVramUsed === null ? t('unavailable') : formatBytes(gpuVramUsed) ?? '—');
      const rootDisk = disks.find((disk) => disk?.mount === '/' || disk?.mount === 'C:') ?? disks[0] ?? null;
      const rootUsage = percentOrNull(rootDisk?.usage);
      const rootMeta = rootDisk === null
        ? t('disk.empty')
        : t('disk.mountUsed', { mount: textOrNull(rootDisk.mount) ?? '—', used: formatBytes(rootDisk.usedBytes) ?? '—' });
      const rootHint = rootDisk === null ? t('unavailable') : t('disk.totalValue', { total: formatBytes(rootDisk.totalBytes) ?? '—' });
      const kpis = [
        {
          key: 'cpu',
          label: t('cpu'),
          color: 'var(--lm-ink)',
          value: percentOrNull(cpu?.usage),
          meta: cpuModel,
          hint: cpuBits.length === 0 ? t('unavailable') : cpuBits.join(' · '),
        },
        {
          key: 'memory',
          label: t('memory'),
          color: 'var(--lm-green)',
          value: memoryPercent(memory),
          meta: memUsed !== null && memTotal !== null
            ? (formatBytes(memUsed) ?? '—') + ' / ' + (formatBytes(memTotal) ?? '—')
            : t('unavailable'),
          hint: memAvailable === null ? t('unavailable') : t('memory.availableShort', { value: formatBytes(memAvailable) ?? '—' }),
        },
        {
          key: 'gpu',
          label: t('gpu'),
          color: 'var(--lm-amber)',
          value: gpuUsage,
          meta: gpuMeta,
          hint: gpuHint,
        },
        {
          key: 'disk',
          label: t('disk'),
          color: 'var(--lm-blue)',
          value: rootUsage,
          meta: rootMeta,
          hint: rootHint,
        },
      ];
      const osSystemLabel = t('os.operatingSystem');
      React.useEffect(() => {
        if (intervalMs === 0) return undefined;
        const timer = setInterval(() => {
          if (typeof document !== 'undefined' && document.hidden) return;
          snapshot.refresh();
        }, intervalMs);
        return () => clearInterval(timer);
      }, [intervalMs, snapshot.refresh]);
      React.useEffect(() => {
        const onVisibility = () => {
          if (typeof document !== 'undefined' && !document.hidden) snapshot.refresh();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
      }, [snapshot.refresh]);
      const changeInterval = (event) => {
        const next = Number(event.target.value);
        setIntervalMs(next);
        if (next > 0) snapshot.refresh();
      };
      return h('section', {
        className: 'lm-page',
        'aria-label': t('title'),
        'aria-busy': snapshot.loading ? 'true' : undefined,
      }, [
        h('style', { key: 'styles' }, CSS),
        h('div', { key: 'scroll', className: 'lm-scroll' }, h('div', { className: 'lm-content' }, [
          h('header', { key: 'heading', className: 'lm-heading' }, [
            h('div', { key: 'identity', className: 'lm-headingText' }, [
              h('div', { key: 'title', className: 'lm-titleRow' }, [
                h('h1', { key: 'h1', className: 'lm-title' }, t('title')),
                h(StatusPill, { key: 'status', status, text: statusText }),
              ]),
              h('p', { key: 'subtitle', className: 'lm-subtitle' }, t('subtitle')),
            ]),
            h('div', { key: 'actions', className: 'lm-actions' }, [
              h('span', { key: 'updated', className: 'lm-updated' }, updated),
              h('span', { key: 'system', className: 'lm-ctl lm-systemChip', title: t('os.detected') }, [
                h('span', { key: 'label' }, t('system')),
                h('span', { key: 'dot', className: 'lm-chipDot', 'aria-hidden': 'true' }),
                h('span', { key: 'value', className: 'lm-chipValue' }, osLabel),
              ]),
              h('label', { key: 'interval', className: 'lm-ctl' }, [
                h('span', { key: 'label' }, t('autoRefresh')),
                h('select', {
                  key: 'select',
                  value: String(intervalMs),
                  onChange: changeInterval,
                  'aria-label': t('autoRefresh'),
                }, [
                  h('option', { key: '2', value: '2000' }, t('every2')),
                  h('option', { key: '5', value: '5000' }, t('every5')),
                  h('option', { key: '10', value: '10000' }, t('every10')),
                  h('option', { key: '0', value: '0' }, t('off')),
                ]),
              ]),
              h('button', {
                key: 'refresh',
                type: 'button',
                className: 'lm-btn',
                onClick: snapshot.refresh,
                'aria-label': t('refresh'),
              }, [
                h('svg', {
                  key: 'icon',
                  className: snapshot.loading ? 'lm-spin' : undefined,
                  width: 16,
                  height: 16,
                  viewBox: '0 0 24 24',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: 2,
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                  'aria-hidden': 'true',
                  focusable: 'false',
                }, [
                  h('path', { key: 'arc', d: 'M21 12a9 9 0 1 1-2.64-6.36' }),
                  h('path', { key: 'tip', d: 'M21 3v6h-6' }),
                ]),
                h('span', { key: 'text' }, t('refresh')),
              ]),
            ]),
          ]),
          snapshot.error === null ? null : h('p', {
            key: 'error',
            className: 'lm-error',
            role: 'alert',
          }, t('error', { message: snapshot.error })),
          legacyHost ? h('div', {
            key: 'legacy',
            className: 'lm-warning',
            role: 'alert',
          }, [
            h('strong', { key: 'title' }, t('legacy.title')),
            h('span', { key: 'body' }, t('legacy.body')),
          ]) : null,
          h('section', { key: 'system', className: 'lm-card lm-systemCard' }, [
            h('div', { key: 'identity', className: 'lm-osIdentity' }, [
              h('div', {
                key: 'icon',
                className: 'lm-osIcon',
                'aria-hidden': 'true',
                dangerouslySetInnerHTML: { __html: DEEPSEEK_MARK },
              }),
              h('div', { key: 'text', className: 'lm-osText' }, [
                h('div', { key: 'badge', className: 'lm-osBadgeRow' }, [
                  h('span', { key: 'label', className: 'lm-kicker' }, osSystemLabel),
                  h('span', { key: 'value', className: 'lm-osBadge' }, osLabel),
                ]),
                h('div', { key: 'release', className: 'lm-osRelease', title: osRelease }, osRelease),
              ]),
            ]),
            h('div', { key: 'info', className: 'lm-sysInfo' }, sysFields.map((field) => h('div', {
              key: field.key,
              className: 'lm-sysField',
            }, [
              h('span', { key: 'label', className: 'lm-sysLabel' }, field.label),
              h('span', { key: 'value', className: 'lm-sysValue', title: field.value }, field.value),
            ]))),
          ]),
          h('section', { key: 'kpis', className: 'lm-kpis', 'aria-label': t('title') },
            kpis.map((kpi) => h(KpiCard, {
              key: kpi.key,
              label: kpi.label,
              color: kpi.color,
              value: kpi.value,
              meta: kpi.meta,
              hint: kpi.hint,
            }))),
          h('section', { key: 'split', className: 'lm-split' }, [
            h(TrendChart, { key: 'trend', history: snapshot.history, t }),
            h(CoresCard, { key: 'cores', cpu, t }),
          ]),
          h('section', { key: 'middle', className: 'lm-gridTwo' }, [
            h(MemoryCard, { key: 'memory', memory, platform, t }),
            h(GpuCard, { key: 'gpu', gpu, t }),
          ]),
          h('section', { key: 'lower', className: 'lm-gridThree' }, [
            h(DiskCard, { key: 'disk', disks, diskIO, platform, t }),
            h(NetworkCard, { key: 'network', network, t }),
            h(SensorsCard, { key: 'sensors', sensors, fan, t }),
          ]),
          h(HarnessCard, {
            key: 'harness',
            harness,
            cpuCores: numberOrNull(cpu?.threads) ?? numberOrNull(cpu?.cores),
            systemMemory: memTotal,
            t,
          }),
          h(SessionCard, { key: 'sessions', harness, t }),
          h(HostRuntimeCard, { key: 'host', harness, t }),
          h(ProcessCard, { key: 'processes', processes, t }),
        ])),
      ]);
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'local-machine: dictionaries');
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          locale: NS,
          label: () => t('panel'),
        }, LocalMachineIcon));
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        }, LocalMachinePage));
      },
    };
  },
});
