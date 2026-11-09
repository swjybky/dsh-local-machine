window.__ModuleLoader__.load({
  id: 'dsh-plugin-local-machine',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this panel. */
    const NS = 'local-machine';
    /** Main-panel key; the sidebar row and the center page share it. */
    const PANEL_ID = 'local-machine';

    /** Simplified Chinese copy. */
    const zh = {
      panel: '本机管理',
      title: '本机管理',
      subtitle: '查看本机 CPU、内存与 GPU 的实时占用',
      refresh: '刷新',
      refreshing: '刷新中…',
      updated: '上次刷新 {time}',
      never: '尚未刷新',
      error: '读取失败：{message}',
      chart: '占用概览',
      chartHint: '最近一次采样，0–100%',
      cpu: 'CPU',
      memory: '内存',
      gpu: 'GPU',
      'cpu.model': '型号',
      'cpu.cores': '逻辑核心',
      'cpu.load': '1 分钟负载',
      'memory.used': '已用内存',
      'memory.total': '内存总量',
      'memory.available': '可用内存',
      'memory.swap': '交换分区已用',
      'memory.swapOff': '未启用',
      'gpu.model': '型号',
      'gpu.vram': '显存占用',
      'gpu.status': '状态',
      'gpu.ready': '正常',
      'gpu.driver': '驱动不可用',
      'gpu.missing': '未检测到 GPU',
      unknown: '未知',
      unavailable: '不可用',
    };

    /** English copy, checked against the Chinese key set. */
    const en = {
      panel: 'Local machine',
      title: 'Local machine',
      subtitle: 'Live CPU, memory, and GPU usage on this machine',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      updated: 'Updated {time}',
      never: 'Not sampled yet',
      error: 'Read failed: {message}',
      chart: 'Usage overview',
      chartHint: 'Latest sample, 0–100%',
      cpu: 'CPU',
      memory: 'Memory',
      gpu: 'GPU',
      'cpu.model': 'Model',
      'cpu.cores': 'Logical cores',
      'cpu.load': '1-minute load',
      'memory.used': 'Used',
      'memory.total': 'Total',
      'memory.available': 'Available',
      'memory.swap': 'Swap used',
      'memory.swapOff': 'Disabled',
      'gpu.model': 'Model',
      'gpu.vram': 'VRAM used',
      'gpu.status': 'Status',
      'gpu.ready': 'Available',
      'gpu.driver': 'Driver unavailable',
      'gpu.missing': 'No GPU detected',
      unknown: 'Unknown',
      unavailable: 'Unavailable',
    };

    /** Panel styles: theme tokens only, classes prefixed `lm-`. */
    const CSS = `
.lm-page{display:flex;flex-direction:column;width:100%;min-width:0;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.6}
.lm-scroll{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable}
.lm-content{max-width:960px;margin:0 auto;padding:0 clamp(24px,4vw,48px) 48px}
.lm-heading{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:16px;padding-top:28px;margin-bottom:24px}
[data-platform=darwin] .lm-heading{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}
.lm-title{margin:0;font-size:20px;font-weight:500;line-height:28px}
.lm-subtitle{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
.lm-actions{display:flex;align-items:center;gap:12px;white-space:nowrap}
.lm-updated{color:var(--dsw-alias-label-secondary);font-size:12px;font-variant-numeric:tabular-nums}
.lm-refresh{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;cursor:pointer}
.lm-refresh:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.lm-refresh:disabled{opacity:.6;cursor:default}
.lm-refresh:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.lm-refreshIcon{flex:none}
.lm-spin{animation:lm-spin 1s linear infinite}
@keyframes lm-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.lm-spin{animation:none}}
.lm-card{box-sizing:border-box;min-width:0;padding:16px 20px 20px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.lm-cardHead{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:16px}
.lm-cardHead h2{margin:0;font-size:14px;font-weight:500;line-height:22px}
.lm-hint{color:var(--dsw-alias-label-secondary);font-size:12px}
.lm-chart{display:flex;align-items:flex-end;justify-content:center;gap:clamp(16px,4vw,48px);padding:8px 0 4px}
.lm-col{display:flex;flex:1;flex-direction:column;align-items:center;gap:6px;min-width:0;max-width:150px}
.lm-barValue{font-size:13px;font-variant-numeric:tabular-nums}
.lm-barTrack{display:flex;align-items:flex-end;width:100%;height:180px;overflow:hidden;border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
.lm-barFill{width:100%;border-radius:10px;transition:height .3s ease}
@media (prefers-reduced-motion:reduce){.lm-barFill{transition:none}}
.lm-barFill[data-tone=cpu]{background:var(--dsw-alias-brand-primary)}
.lm-barFill[data-tone=memory]{background:var(--dsw-alias-state-success-primary)}
.lm-barFill[data-tone=gpu]{background:var(--dsw-alias-state-warn-primary)}
.lm-barFill[data-tone=none]{background:var(--dsw-alias-state-idle-primary);opacity:.5}
.lm-barLabel{font-size:12px;color:var(--dsw-alias-label-secondary)}
.lm-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:16px}
.lm-rows{display:flex;flex-direction:column}
.lm-row{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:6px 0;border-top:0.5px solid var(--dsw-alias-border-l1);font-size:13px}
.lm-row:first-child{padding-top:0;border-top:0}
.lm-rowLabel{flex:none;color:var(--dsw-alias-label-secondary)}
.lm-rowValue{min-width:0;text-align:right;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.lm-error{margin:0 0 16px;padding:10px 14px;border:0.5px solid var(--dsw-alias-state-error-primary);border-radius:10px;color:var(--dsw-alias-state-error-primary);font-size:13px}
@media (width<=767px){.lm-content{padding-inline:20px}.lm-chart{gap:16px}}
`;

    /**
     * Resolve the current text binding from the slot props.
     * @param props - Slot props supplied by the host.
     * @returns Translate function.
     */
    function translateOf(props) {
      return typeof props.t === 'function' ? props.t : (key) => key;
    }

    /**
     * Read one usage value as a 0-100 percentage.
     * @param value - Raw number from the Host.
     * @returns Percentage or null when the metric is unknown.
     */
    function percentOf(value) {
      const number = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : null;
    }

    /**
     * Render one percentage for display.
     * @param value - Percentage or null.
     * @param placeholder - Text used when no value exists.
     * @returns Display string.
     */
    function formatPercent(value, placeholder) {
      return value === null ? placeholder : value.toFixed(1) + '%';
    }

    /**
     * Format a byte count for display.
     * @param bytes - Byte count or null.
     * @returns `12.3 GB` style text, or null.
     */
    function formatBytes(bytes) {
      if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null;
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let value = bytes;
      let unit = 0;
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
      }
      const text = unit === 0 || value >= 100 ? String(Math.round(value)) : value.toFixed(1);
      return text + ' ' + units[unit];
    }

    /**
     * Format the local sampling time.
     * @param time - Epoch milliseconds.
     * @returns `HH:mm:ss` text.
     */
    function formatTime(time) {
      try {
        return new Date(time).toLocaleTimeString([], {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      } catch {
        return '';
      }
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
     * @returns Parsed snapshot payload.
     */
    async function fetchSnapshot() {
      const response = await fetch(metricsUrl(), {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const body = await response.json();
      if (typeof body !== 'object' || body === null) throw new Error('invalid payload');
      if (typeof body.error === 'string') throw new Error(body.error);
      return body;
    }

    /**
     * Own the snapshot state of one mounted panel.
     * @returns Snapshot, phase flags, and the refresh action.
     */
    function useSnapshot() {
      const [state, setState] = React.useState({ data: null, error: null, loading: true, at: null });
      const latest = React.useRef(0);
      const mounted = React.useRef(true);
      const refresh = React.useCallback(() => {
        const ticket = latest.current + 1;
        latest.current = ticket;
        setState((previous) => ({ data: previous.data, error: null, loading: true, at: previous.at }));
        fetchSnapshot().then((data) => {
          if (!mounted.current || latest.current !== ticket) return;
          setState({ data, error: null, loading: false, at: Date.now() });
        }, (error) => {
          if (!mounted.current || latest.current !== ticket) return;
          setState((previous) => ({
            data: previous.data,
            error: error instanceof Error ? error.message : String(error),
            loading: false,
            at: previous.at,
          }));
        });
      }, []);
      React.useEffect(() => {
        mounted.current = true;
        refresh();
        return () => {
          mounted.current = false;
        };
      }, [refresh]);
      return Object.assign({}, state, { refresh });
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
     * One bar of the overview chart.
     * @param props - Column label, tone, and percentage.
     * @returns The column element.
     */
    function UsageColumn(props) {
      return h('div', { className: 'lm-col' }, [
        h('span', { key: 'value', className: 'lm-barValue' }, formatPercent(props.value, '—')),
        h('div', { key: 'track', className: 'lm-barTrack' }, h('div', {
          className: 'lm-barFill',
          'data-tone': props.value === null ? 'none' : props.tone,
          style: { height: (props.value === null ? 0 : Math.max(2, props.value)) + '%' },
        })),
        h('span', { key: 'label', className: 'lm-barLabel' }, props.label),
      ]);
    }

    /**
     * One detail card with label/value rows.
     * @param props - Card title and rows.
     * @returns The card element.
     */
    function DetailCard(props) {
      return h('section', { className: 'lm-card' }, [
        h('div', { key: 'head', className: 'lm-cardHead' }, h('h2', null, props.title)),
        h('div', { key: 'rows', className: 'lm-rows' }, props.rows.map((row) => h('div', {
          key: row.label,
          className: 'lm-row',
        }, [
          h('span', { key: 'label', className: 'lm-rowLabel' }, row.label),
          h('span', { key: 'value', className: 'lm-rowValue' }, row.value),
        ]))),
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
      const data = snapshot.data;
      const cpu = data === null || data.cpu === undefined ? null : data.cpu;
      const memory = data === null || data.memory === undefined ? null : data.memory;
      const gpu = data === null || data.gpu === undefined ? null : data.gpu;
      const gpuAvailable = gpu !== null && gpu.available === true;
      const unavailable = t('unavailable');
      const unknown = t('unknown');
      const updated = snapshot.at === null ? t('never') : t('updated', { time: formatTime(snapshot.at) });
      const combined = (used, total) => {
        const usedText = formatBytes(used);
        const totalText = formatBytes(total);
        if (usedText === null && totalText === null) return unavailable;
        if (totalText === null) return usedText;
        return (usedText === null ? unavailable : usedText) + ' / ' + totalText;
      };
      const columns = [
        { key: 'cpu', label: t('cpu'), tone: 'cpu', value: cpu === null ? null : percentOf(cpu.usage) },
        { key: 'memory', label: t('memory'), tone: 'memory', value: memory === null ? null : percentOf(memory.usage) },
        { key: 'gpu', label: t('gpu'), tone: 'gpu', value: gpuAvailable ? percentOf(gpu.usage) : null },
      ];
      const cpuRows = cpu === null ? [
        { label: t('cpu.model'), value: unknown },
      ] : [
        { label: t('cpu.model'), value: typeof cpu.model === 'string' && cpu.model !== '' ? cpu.model : unknown },
        { label: t('cpu.cores'), value: typeof cpu.cores === 'number' ? String(cpu.cores) : unknown },
        { label: t('cpu.load'), value: typeof cpu.load === 'number' ? cpu.load.toFixed(2) : unknown },
      ];
      const memoryRows = memory === null ? [
        { label: t('memory.total'), value: unknown },
      ] : [
        { label: t('memory.used'), value: combined(memory.usedBytes, memory.totalBytes) },
        { label: t('memory.total'), value: formatBytes(memory.totalBytes) ?? unknown },
        { label: t('memory.available'), value: formatBytes(memory.availableBytes) ?? unknown },
        { label: t('memory.swap'), value: memory.swapTotalBytes === 0 ? t('memory.swapOff') : combined(memory.swapUsedBytes, memory.swapTotalBytes) },
      ];
      const gpuStatus = data === null
        ? '—'
        : gpuAvailable
          ? t('gpu.ready')
          : gpu === null || gpu.reason === 'not-detected'
            ? t('gpu.missing')
            : t('gpu.driver');
      const gpuRows = [
        { label: t('gpu.model'), value: gpu !== null && typeof gpu.name === 'string' && gpu.name !== '' ? gpu.name : unknown },
        { label: t('gpu.vram'), value: gpuAvailable ? combined(gpu.memoryUsedBytes, gpu.memoryTotalBytes) : unavailable },
        { label: t('gpu.status'), value: gpuStatus },
      ];
      return h('section', {
        className: 'lm-page',
        'aria-label': t('title'),
        'aria-busy': snapshot.loading ? 'true' : undefined,
      }, [
        h('style', { key: 'styles' }, CSS),
        h('div', { key: 'scroll', className: 'lm-scroll' }, h('div', { className: 'lm-content' }, [
          h('header', { key: 'heading', className: 'lm-heading' }, [
            h('div', { key: 'identity' }, [
              h('h1', { key: 'title', className: 'lm-title' }, t('title')),
              h('p', { key: 'subtitle', className: 'lm-subtitle' }, t('subtitle')),
            ]),
            h('div', { key: 'actions', className: 'lm-actions' }, [
              h('span', { key: 'updated', className: 'lm-updated' }, updated),
              h('button', {
                key: 'refresh',
                type: 'button',
                className: 'lm-refresh',
                onClick: snapshot.refresh,
                disabled: snapshot.loading,
                'aria-label': t('refresh'),
              }, [
                h('svg', {
                  key: 'icon',
                  className: 'lm-refreshIcon' + (snapshot.loading ? ' lm-spin' : ''),
                  width: 14,
                  height: 14,
                  viewBox: '0 0 16 16',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: 1.6,
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                  'aria-hidden': 'true',
                  focusable: 'false',
                }, [
                  h('path', { key: 'arc', d: 'M13.4 9.33A5.6 5.6 0 1 1 12.29 4.4' }),
                  h('path', { key: 'tip', d: 'M12.9 1.2 12.29 4.4 15.5 5' }),
                ]),
                h('span', { key: 'text' }, snapshot.loading ? t('refreshing') : t('refresh')),
              ]),
            ]),
          ]),
          snapshot.error === null ? null : h('p', {
            key: 'error',
            className: 'lm-error',
            role: 'alert',
          }, t('error', { message: snapshot.error })),
          h('section', { key: 'chart', className: 'lm-card', 'aria-label': t('chart') }, [
            h('div', { key: 'head', className: 'lm-cardHead' }, [
              h('h2', { key: 'title' }, t('chart')),
              h('span', { key: 'hint', className: 'lm-hint' }, t('chartHint')),
            ]),
            h('div', { key: 'bars', className: 'lm-chart' }, columns.map((column) => h(UsageColumn, {
              key: column.key,
              label: column.label,
              tone: column.tone,
              value: column.value,
            }))),
          ]),
          h('div', { key: 'cards', className: 'lm-cards' }, [
            h(DetailCard, { key: 'cpu', title: t('cpu'), rows: cpuRows }),
            h(DetailCard, { key: 'memory', title: t('memory'), rows: memoryRows }),
            h(DetailCard, { key: 'gpu', title: t('gpu'), rows: gpuRows }),
          ]),
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
