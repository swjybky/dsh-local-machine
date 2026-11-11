/**
 * Parser and live-snapshot tests for the Local machine Host half.
 *
 * The parser fixtures cover the shapes emitted by Linux, macOS, and Windows,
 * so this suite stays useful on every platform. The live test reads whichever
 * machine runs it and is the end-to-end check to repeat on each OS.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  aggregateCpuTimes,
  busyPercent,
  parseAmdClocks,
  parseDiskstats,
  parseDf,
  parseIfconfigMedia,
  parseIoregBlockStorage,
  parseIoregGpu,
  parseLoadThreads,
  parseMounts,
  parseNetDev,
  parseNetstatIb,
  parseNvidiaComputeApps,
  parseNvidiaProcInformation,
  parseNvidiaProcVersion,
  parseNvidiaSmi,
  parseNvidiaSmiHeader,
  parseOsRelease,
  parsePageFileUsage,
  parseProcMeminfo,
  parseProcStat,
  parseProcStatLines,
  parsePsProcesses,
  parseSwVers,
  parseSystemProfilerMemory,
  parseVideoControllers,
  parseVmStat,
  parseSwapusage,
  parseWindowsCpuInfo,
  parseWindowsDisks,
  parseWindowsFans,
  parseWindowsMemoryModules,
  parseWindowsNetwork,
  parseWindowsOsInfo,
  parseWindowsPerfNetwork,
  parseWindowsProcesses,
  parseWindowsThermalZones,
  perCoreBusyPercents,
  perCoreCpuTimes,
  readSnapshot,
  selectFanReading,
  selectTemperatureSensors,
} from '../lib/platform.js'

test('parseProcStat reads the aggregate cpu line', () => {
  const text = [
    'cpu  100 0 50 850 0 0 0 0 0 0',
    'cpu0 50 0 25 425 0 0 0 0 0 0',
    'intr 12345',
  ].join('\n')
  assert.deepEqual(parseProcStat(text), { idle: 850, total: 1000 })
})

test('parseProcStat includes only the eight non-guest counters', () => {
  const text = 'cpu  100 0 50 850 0 0 0 0 900 900\n'
  assert.deepEqual(parseProcStat(text), { idle: 850, total: 1000 })
})

test('parseProcStat rejects malformed input', () => {
  assert.equal(parseProcStat(''), null)
  assert.equal(parseProcStat('cpu0 1 2 3 4\n'), null)
  assert.equal(parseProcStat('cpu 1 2 nope 4\n'), null)
})

test('parseProcStatLines keeps one row per logical core', () => {
  const parsed = parseProcStatLines([
    'cpu  100 0 50 850 0 0 0 0 0 0',
    'cpu0 50 0 25 425 0 0 0 0 0 0',
    'cpu1 50 0 25 425 0 0 0 0 0 0',
  ].join('\n'))
  assert.deepEqual(parsed.aggregate, { idle: 850, total: 1000 })
  assert.deepEqual(parsed.cores, [
    { index: 0, idle: 425, total: 500 },
    { index: 1, idle: 425, total: 500 },
  ])
})

test('aggregateCpuTimes sums os.cpus() counters across cores', () => {
  const totals = aggregateCpuTimes([
    { times: { user: 100, nice: 0, sys: 50, idle: 850, irq: 0 } },
    { times: { user: 200, nice: 0, sys: 100, idle: 700, irq: 0 } },
  ])
  assert.deepEqual(totals, { idle: 1550, total: 2000 })
  assert.equal(busyPercent({ ...totals, source: 'os' }, {
    idle: 2050,
    total: 3000,
    source: 'os',
  }), 50)
})

test('busyPercent refuses to mix counter sources', () => {
  assert.equal(busyPercent(
    { idle: 100, total: 200, source: 'proc' },
    { idle: 150, total: 300, source: 'os' },
  ), null)
})

test('perCoreCpuTimes and perCoreBusyPercents stay per logical core', () => {
  const times = perCoreCpuTimes([
    { times: { user: 100, nice: 0, sys: 50, idle: 850, irq: 0 } },
    { times: { user: 100, nice: 0, sys: 0, idle: 900, irq: 0 } },
  ])
  assert.deepEqual(times, [
    { idle: 850, total: 1000 },
    { idle: 900, total: 1000 },
  ])
  assert.deepEqual(perCoreBusyPercents(
    times,
    [
      { idle: 1700, total: 2000 },
      { idle: 1800, total: 2000 },
    ],
  ), [15, 10])
})

test('parseProcMeminfo derives used, free, cached, and swap', () => {
  const text = [
    'MemTotal:       16000000 kB',
    'MemFree:         2000000 kB',
    'MemAvailable:    8000000 kB',
    'Buffers:           100000 kB',
    'Cached:            300000 kB',
    'SReclaimable:       50000 kB',
    'SwapTotal:       4000000 kB',
    'SwapFree:        1000000 kB',
  ].join('\n')
  const memory = parseProcMeminfo(text)
  assert.equal(memory.totalBytes, 16000000 * 1024)
  assert.equal(memory.availableBytes, 8000000 * 1024)
  assert.equal(memory.usedBytes, 8000000 * 1024)
  assert.equal(memory.freeBytes, 2000000 * 1024)
  assert.equal(memory.cachedBytes, 6000000 * 1024)
  assert.equal(memory.usage, 50)
  assert.equal(memory.swapTotalBytes, 4000000 * 1024)
  assert.equal(memory.swapUsedBytes, 3000000 * 1024)
})

test('parseProcMeminfo falls back to MemFree and rejects missing totals', () => {
  const memory = parseProcMeminfo('MemTotal: 1000 kB\nMemFree: 250 kB\n')
  assert.equal(memory.usedBytes, 750 * 1024)
  assert.equal(memory.availableBytes, null)
  assert.equal(memory.cachedBytes, null)
  assert.equal(parseProcMeminfo('MemFree: 1 kB\n'), null)
})

test('parseVmStat handles an Apple Silicon page size', () => {
  const text = [
    'Mach Virtual Memory Statistics: (page size of 16384 bytes)',
    'Pages free:                              123456.',
    'Pages active:                            456789.',
    'Pages inactive:                          234567.',
    'Pages speculative:                        12345.',
    'Pages wired down:                        111111.',
    '"Translation faults":                 12345678.',
    'Pages occupied by compressor:            234567.',
  ].join('\n')
  const vmStat = parseVmStat(text)
  assert.equal(vmStat.pageSize, 16384)
  assert.equal(vmStat.availableBytes, (123456 + 234567 + 12345) * 16384)
  assert.equal(vmStat.freeBytes, 123456 * 16384)
  assert.equal(vmStat.cachedBytes, (234567 + 12345) * 16384)
})

test('parseVmStat defaults to a 4 KiB page size', () => {
  const text = [
    'Mach Virtual Memory Statistics: (page size of 4096 bytes)',
    'Pages free: 10.',
    'Pages inactive: 20.',
    'Pages speculative: 30.',
  ].join('\n')
  assert.deepEqual(parseVmStat(text), {
    pageSize: 4096,
    freeBytes: 10 * 4096,
    inactiveBytes: 20 * 4096,
    speculativeBytes: 30 * 4096,
    cachedBytes: 50 * 4096,
    availableBytes: 60 * 4096,
  })
})

test('parseVmStat rejects output without free pages', () => {
  assert.equal(parseVmStat(''), null)
  assert.equal(parseVmStat('Pages active: 10.'), null)
})

test('parseSwapusage converts M and G units', () => {
  const swap = parseSwapusage('total = 8192.00M  used = 1024.50M  free = 7167.50M  (encrypted)')
  assert.equal(swap.totalBytes, Math.round(8192 * 1024 ** 2))
  assert.equal(swap.usedBytes, Math.round(1024.5 * 1024 ** 2))
  assert.equal(parseSwapusage('total = 2.00G  used = 0.25G').totalBytes, 2 * 1024 ** 3)
  assert.equal(parseSwapusage('vm.swapusage: total = 2048.00M  used = 0.00M').totalBytes, 2048 * 1024 ** 2)
})

test('parseDiskstats sums whole disks and ignores partitions and stacks', () => {
  const disks = parseDiskstats([
    '   8       0 sda 100 0 2000 0 50 0 4000 0 0 0 0 0 0 0 0 0',
    '   8       1 sda1 100 0 2000 0 50 0 4000 0 0 0 0 0 0 0 0 0',
    ' 259       0 nvme0n1 10 0 100 0 20 0 200 0 0 0 0 0 0 0 0 0',
    ' 253       0 dm-0 1 0 1 0 1 0 1 0 0 0 0 0 0 0 0 0',
  ].join('\n'))
  assert.equal(disks.length, 2)
  assert.deepEqual(disks[0], {
    name: 'sda',
    readBytes: 2000 * 512,
    writeBytes: 4000 * 512,
    readOps: 100,
    writeOps: 50,
  })
  assert.equal(disks[1].name, 'nvme0n1')
  assert.equal(parseDiskstats(''), null)
})

test('parseNetDev reads cumulative interface counters', () => {
  const counters = parseNetDev([
    'Inter-|   Receive                                                |  Transmit',
    ' face |bytes    packets errs drop fifo frame compressed multicast|bytes packets errs drop fifo colls carrier compressed',
    '    lo: 100 1 0 0 0 0 0 0 100 1 0 0 0 0 0 0',
    'enp4s0: 2000 2 0 0 0 0 0 0 3000 3 0 0 0 0 0 0',
  ].join('\n'))
  assert.deepEqual(counters, [
    { interface: 'lo', receivedBytes: 100, transmittedBytes: 100 },
    { interface: 'enp4s0', receivedBytes: 2000, transmittedBytes: 3000 },
  ])
})

test('parseMounts keeps local filesystems and decodes octal escapes', () => {
  const mounts = parseMounts([
    '/dev/sda1 / ext4 rw 0 0',
    '/dev/sda2 /mnt/my\\040disk xfs rw 0 0',
    'tmpfs /tmp tmpfs rw 0 0',
    '/dev/sdb1 /boot/efi vfat rw 0 0',
    'overlay /var/lib/docker/overlay2/abc overlay rw 0 0',
  ].join('\n'))
  assert.deepEqual(mounts, [
    { device: '/dev/sda1', mount: '/', fs: 'ext4' },
    { device: '/dev/sda2', mount: '/mnt/my disk', fs: 'xfs' },
    { device: '/dev/sdb1', mount: '/boot/efi', fs: 'vfat' },
  ])
  assert.deepEqual(parseMounts(''), [])
})

test('parseDf reads POSIX df output including a mount with spaces', () => {
  const rows = parseDf([
    'Filesystem 1024-blocks Used Available Capacity Mounted on',
    '/dev/sda1 1000 400 500 45% /',
    '/dev/sdb1 2000 1000 900 53% /mnt/my disk',
  ].join('\n'))
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[1], {
    device: '/dev/sdb1',
    mount: '/mnt/my disk',
    totalBytes: 2000 * 1024,
    usedBytes: 1000 * 1024,
    availableBytes: 900 * 1024,
  })
})

test('parseNetstatIb keeps the link-layer row per macOS interface', () => {
  const counters = parseNetstatIb([
    'Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll',
    'en0 1500 <Link#4> aa:bb:cc:dd:ee:ff 100 0 1000 50 0 500 0',
    'en0 1500 192.168.1 192.168.1.2 100 - 1000 50 - 500 -',
  ].join('\n'))
  assert.deepEqual(counters, [{ interface: 'en0', receivedBytes: 1000, transmittedBytes: 500 }])
  assert.equal(parseNetstatIb('Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll'), null)
})

test('parseIfconfigMedia reads Ethernet and Fast Ethernet media lines', () => {
  assert.equal(parseIfconfigMedia('media: autoselect (2500Base-T <full-duplex>)'), 2500)
  assert.equal(parseIfconfigMedia('media: autoselect (1000baseT <full-duplex>)'), 1000)
  assert.equal(parseIfconfigMedia('media: IEEE 802.11 Wireless Ethernet MCS mode'), null)
})

test('selectTemperatureSensors picks CPU, GPU, NVMe, and board in order', () => {
  const sensors = selectTemperatureSensors([
    { chip: 'coretemp', label: 'Core 0', celsius: 44 },
    { chip: 'coretemp', label: 'Package id 0', celsius: 46 },
    { chip: 'nvme', label: 'Composite', celsius: 38 },
    { chip: 'acpitz', label: 'temp1', celsius: 34 },
    { chip: 'amdgpu', label: 'edge', celsius: 41 },
  ])
  assert.deepEqual(sensors, [
    { key: 'cpu', label: 'Package id 0', celsius: 46 },
    { key: 'gpu', label: 'edge', celsius: 41 },
    { key: 'nvme', label: 'Composite', celsius: 38 },
    { key: 'board', label: 'temp1', celsius: 34 },
  ])
  assert.deepEqual(selectTemperatureSensors([
    { chip: 'coretemp', label: 'Package id 0', celsius: 200 },
    { chip: 'coretemp', label: 'Core 2', celsius: 55 },
  ]), [{ key: 'cpu', label: 'Core 2', celsius: 55 }])
  assert.deepEqual(selectTemperatureSensors([
    { chip: 'acpi', label: 'TZ00', celsius: 46 },
  ]), [{ key: 'other', label: 'TZ00', celsius: 46 }])
})

test('selectFanReading prefers a CPU fan and keeps its max speed', () => {
  assert.deepEqual(selectFanReading([
    { chip: 'nct6775', label: 'Case Fan', rpm: 800, maxRpm: 1500 },
    { chip: 'nct6775', label: 'CPU Fan', rpm: 1120, maxRpm: 3000 },
  ]), { key: 'fan', label: 'CPU Fan', rpm: 1120, maxRpm: 3000 })
  assert.equal(selectFanReading([{ chip: 'nct6775', rpm: 0 }]), null)
})

test('parseNvidiaSmi reads utilization, VRAM, power, fan, and clocks', () => {
  const gpu = parseNvidiaSmi('NVIDIA GeForce RTX 4060 Ti, 27, 1234, 8188, 18.5, 165.0, 30, 41, 560.35.03, 2535, 9001\n')
  assert.equal(gpu.available, true)
  assert.equal(gpu.vendor, 'nvidia')
  assert.equal(gpu.name, 'NVIDIA GeForce RTX 4060 Ti')
  assert.equal(gpu.usage, 27)
  assert.equal(gpu.memoryUsedBytes, 1234 * 1024 ** 2)
  assert.equal(gpu.memoryTotalBytes, 8188 * 1024 ** 2)
  assert.equal(gpu.powerWatts, 18.5)
  assert.equal(gpu.powerLimitWatts, 165)
  assert.equal(gpu.fanPercent, 30)
  assert.equal(gpu.temperatureCelsius, 41)
  assert.equal(gpu.driverVersion, '560.35.03')
  assert.equal(gpu.coreClockMhz, 2535)
  assert.equal(gpu.memoryClockMhz, 9001)
})

test('parseNvidiaSmi tolerates unavailable cells', () => {
  const gpu = parseNvidiaSmi('NVIDIA GeForce GTX 1080, [N/A], [N/A], 8192, [N/A], [N/A], [N/A], [N/A], [N/A], [N/A], [N/A]\n')
  assert.equal(gpu.available, true)
  assert.equal(gpu.usage, null)
  assert.equal(gpu.memoryUsedBytes, null)
  assert.equal(gpu.fanPercent, null)
  assert.equal(gpu.driverVersion, null)
  assert.equal(parseNvidiaSmi('NVIDIA-SMI has failed because it could not communicate with the driver'), null)
})

test('parseNvidiaSmiHeader and compute apps read the auxiliary output', () => {
  assert.deepEqual(
    parseNvidiaSmiHeader('| NVIDIA-SMI 560.35.03    Driver Version: 560.35.03    CUDA Version: 12.6 |'),
    { cudaVersion: '12.6', driverVersion: '560.35.03' },
  )
  assert.deepEqual(parseNvidiaComputeApps('4821, 212\n5310, 86\n'), [
    { pid: 4821, memoryBytes: 212 * 1024 ** 2 },
    { pid: 5310, memoryBytes: 86 * 1024 ** 2 },
  ])
  assert.deepEqual(parseNvidiaComputeApps('No running processes found'), [])
})

test('parseNvidiaProcInformation and version describe a driverless card', () => {
  const gpu = parseNvidiaProcInformation('Model:\t\t NVIDIA GeForce RTX 4060 Ti\nIRQ:\t\t 187\n')
  assert.equal(gpu.name, 'NVIDIA GeForce RTX 4060 Ti')
  assert.equal(gpu.reason, 'driver-unavailable')
  assert.equal(parseNvidiaProcVersion('NVRM version: NVIDIA UNIX x86_64 Kernel Module  580.178.04'), '580.178.04')
})

test('parseIoregGpu reads Apple Silicon accelerator statistics', () => {
  const text = [
    '+-o IGPU  <class AGXAcceleratorG13X, id 0x1000004d4, registered, matched, active, busy 0 (17 ms), retain 12>',
    '  {',
    '    "IOClass" = "AGXAcceleratorG13X"',
    '    "model" = "Apple M1 Pro"',
    '    "PerformanceStatistics" = {"Device Utilization %"=7,"Renderer Utilization %"=3,"Tiler Utilization %"=0}',
    '  }',
  ].join('\n')
  const gpu = parseIoregGpu(text)
  assert.equal(gpu.available, true)
  assert.equal(gpu.vendor, 'apple')
  assert.equal(gpu.name, 'Apple M1 Pro')
  assert.equal(gpu.usage, 7)
  assert.equal(gpu.reason, null)
})

test('parseIoregGpu prefers the accelerator that reports utilization', () => {
  const text = [
    '+-o IGPU  <class IOAccelerator, id 1, registered, matched, active, busy 0, retain 4>',
    '  {',
    '    "model" = "Intel(R) Iris(TM) Plus Graphics"',
    '  }',
    '',
    '+-o dGPU  <class AMDRadeonX6000, id 2, registered, matched, active, busy 0, retain 4>',
    '  {',
    '    "model" = "AMD Radeon Pro 5500M"',
    '    "PerformanceStatistics" = {"Device Utilization %"=12}',
    '  }',
  ].join('\n')
  const gpu = parseIoregGpu(text)
  assert.equal(gpu.available, true)
  assert.equal(gpu.vendor, 'amd')
  assert.equal(gpu.name, 'AMD Radeon Pro 5500M')
  assert.equal(gpu.usage, 12)
})

test('parseIoregGpu reports a model-only accelerator as unsupported', () => {
  const text = [
    '+-o IGPU  <class IOAccelerator, id 1, registered, matched, active, busy 0, retain 4>',
    '  {',
    '    "model" = "Intel(R) Iris(TM) Plus Graphics"',
    '  }',
  ].join('\n')
  const gpu = parseIoregGpu(text)
  assert.equal(gpu.available, false)
  assert.equal(gpu.name, 'Intel(R) Iris(TM) Plus Graphics')
  assert.equal(gpu.usage, null)
  assert.equal(gpu.reason, 'unsupported')
})

test('parseIoregGpu names an accelerator that has no model property', () => {
  const text = [
    '+-o IGPU  <class AGXAcceleratorG13X, id 1, registered, matched, active, busy 0, retain 4>',
    '  {',
    '    "IOClass" = "AGXAcceleratorG13X"',
    '  }',
  ].join('\n')
  const gpu = parseIoregGpu(text)
  assert.equal(gpu.name, 'Apple GPU')
  assert.equal(gpu.reason, 'unsupported')
})

test('parseIoregGpu rejects empty output', () => {
  assert.equal(parseIoregGpu(''), null)
  assert.equal(parseIoregGpu('+-o unrelated <class IOPCIDevice, id 1>'), null)
})

test('parseIoregBlockStorage sums drive byte counters', () => {
  assert.deepEqual(
    parseIoregBlockStorage('"Statistics" = {"Bytes (Read)"=1000,"Bytes (Write)"=2000}\n"Statistics" = {"Bytes (Read)"=3000,"Bytes (Write)"=4000}'),
    { readBytes: 4000, writeBytes: 6000 },
  )
})

test('parseAmdClocks reads the starred clock row', () => {
  assert.equal(parseAmdClocks('0: 500Mhz\n1: 2100Mhz *\n'), 2100)
  assert.equal(parseAmdClocks(''), null)
})

test('parsePageFileUsage sums one or many page files', () => {
  assert.deepEqual(
    parsePageFileUsage('{"AllocatedBaseSize":4096,"CurrentUsage":512}'),
    { totalBytes: 4096 * 1024 ** 2, usedBytes: 512 * 1024 ** 2 },
  )
  assert.deepEqual(
    parsePageFileUsage('[{"AllocatedBaseSize":2048,"CurrentUsage":256},{"AllocatedBaseSize":1024,"CurrentUsage":128}]'),
    { totalBytes: 3072 * 1024 ** 2, usedBytes: 384 * 1024 ** 2 },
  )
  assert.equal(parsePageFileUsage(''), null)
  assert.equal(parsePageFileUsage('not json'), null)
})

test('parseVideoControllers prefers a discrete adapter and skips virtual ones', () => {
  const gpu = parseVideoControllers(JSON.stringify([
    { Name: 'Intel(R) UHD Graphics 630' },
    { Name: 'AMD Radeon RX 6800', DriverVersion: '31.0.12027.9001' },
    { Name: 'Microsoft Remote Display Adapter' },
  ]))
  assert.equal(gpu.available, false)
  assert.equal(gpu.vendor, 'amd')
  assert.equal(gpu.name, 'AMD Radeon RX 6800')
  assert.equal(gpu.driverVersion, '31.0.12027.9001')
  assert.equal(gpu.reason, 'unsupported')

  const single = parseVideoControllers('{"Name":"NVIDIA GeForce RTX 4060 Ti","DriverVersion":"560.35.03"}')
  assert.equal(single.name, 'NVIDIA GeForce RTX 4060 Ti')
  assert.equal(parseVideoControllers('[{"Name":"Microsoft Basic Display Adapter"}]'), null)
  assert.equal(parseVideoControllers('[{"Name":"Microsoft Basic Render Driver"}]'), null)
})

test('parseOsRelease, parseSwVers, and parseSystemProfilerMemory derive OS facts', () => {
  assert.deepEqual(
    parseOsRelease('NAME="Ubuntu"\nVERSION="24.04.1 LTS"\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04.1 LTS"\n'),
    { release: 'Ubuntu 24.04.1 LTS', name: 'Ubuntu', version: '24.04' },
  )
  assert.deepEqual(parseSwVers('ProductName:\tmacOS\nProductVersion:\t15.1\nBuildVersion:\t24B83\n'), {
    release: 'macOS 15.1',
    version: '24B83',
  })
  assert.deepEqual(parseSystemProfilerMemory([
    'Memory:',
    '  Memory Slots:',
    '    BANK 0/1:',
    '      Size: 32 GB',
    '      Type: DDR5',
    '      Speed: 5600 MT/s',
  ].join('\n')), {
    type: 'DDR5',
    count: 1,
    totalBytes: 32 * 1024 ** 3,
    speedMhz: 5600,
  })
})

test('parseWindowsOsInfo and parseWindowsCpuInfo read the CIM summary', () => {
  assert.deepEqual(
    parseWindowsOsInfo('{"Caption":"Microsoft Windows 11 专业版","Version":"10.0.22631","BuildNumber":"22631"}'),
    { release: 'Windows 11 专业版', version: '10.0.22631' },
  )
  assert.deepEqual(
    parseWindowsCpuInfo('{"Name":"Intel(R) Core(TM) i7-14700KF","NumberOfCores":20,"NumberOfLogicalProcessors":28,"CurrentClockSpeed":3400,"MaxClockSpeed":5500}'),
    {
      name: 'Intel(R) Core(TM) i7-14700KF',
      cores: 20,
      threads: 28,
      frequencyMhz: 3400,
      currentFrequencyMhz: 3400,
      maxFrequencyMhz: 5500,
    },
  )
})

test('parseWindowsMemoryModules produces a spec summary', () => {
  const spec = parseWindowsMemoryModules(JSON.stringify([
    { Capacity: '34359738368', Speed: 5600, ConfiguredClockSpeed: 5600, SMBIOSMemoryType: 34 },
    { Capacity: '34359738368', Speed: 5600, ConfiguredClockSpeed: 5600, SMBIOSMemoryType: 34 },
  ]))
  assert.deepEqual(spec, {
    type: 'DDR5',
    count: 2,
    totalBytes: 64 * 1024 ** 3,
    speedMhz: 5600,
  })
})

test('parseWindowsDisks subtracts free space from each logical disk', () => {
  const disks = parseWindowsDisks(JSON.stringify([
    { DeviceID: 'C:', VolumeName: 'System', FileSystem: 'NTFS', Size: 1000, FreeSpace: 400 },
    { DeviceID: 'D:', VolumeName: 'Data', FileSystem: 'NTFS', Size: 2000, FreeSpace: 500 },
  ]))
  assert.deepEqual(disks[0], {
    device: 'C:',
    mount: 'C:',
    label: 'System',
    fs: 'NTFS',
    totalBytes: 1000,
    usedBytes: 600,
    availableBytes: 400,
  })
  assert.equal(disks[1].usedBytes, 1500)
})

test('parseWindowsProcesses filters helper processes and sums threads', () => {
  const processes = parseWindowsProcesses(JSON.stringify({
    processes: [
      { Name: 'chrome#1', IDProcess: 100, PercentProcessorTime: 25, WorkingSet: 1000, ThreadCount: 10 },
      { Name: 'powershell', IDProcess: 101, PercentProcessorTime: 50, WorkingSet: 2000, ThreadCount: 5 },
      { Name: 'node.exe', IDProcess: 102, PercentProcessorTime: 5, WorkingSet: 3000, ThreadCount: 4 },
    ],
  }))
  assert.equal(processes.total, 2)
  assert.equal(processes.threads, 14)
  assert.equal(processes.top.length, 2)
  assert.equal(processes.top[0].name, 'chrome')
  assert.equal(processes.top[0].cpuPercent, 25)
  assert.equal(processes.top[0].user, null)
})

test('parseWindowsNetwork and parseWindowsPerfNetwork read adapter counters', () => {
  const adapters = parseWindowsNetwork(JSON.stringify([
    { name: 'Ethernet', description: 'Intel', linkSpeed: '2.5 Gbps', receivedBytes: 1000, transmittedBytes: 500 },
  ]))
  assert.deepEqual(adapters, [{
    interface: 'Ethernet',
    description: 'Intel',
    linkSpeedMbps: 2500,
    receivedBytes: 1000,
    transmittedBytes: 500,
  }])
  assert.deepEqual(parseWindowsPerfNetwork(JSON.stringify([
    { Name: 'Intel[R] Ethernet', BytesReceivedPersec: 123, BytesSentPersec: 45 },
  ])), [{
    interface: 'Intel[R] Ethernet',
    description: null,
    linkSpeedMbps: null,
    receivedBytes: null,
    transmittedBytes: null,
    downBytesPerSecond: 123,
    upBytesPerSecond: 45,
  }])
})

test('parseWindowsThermalZones and parseWindowsFans read ACPI sensors', () => {
  const zones = parseWindowsThermalZones(JSON.stringify([
    { InstanceName: 'ACPI\\ThermalZone\\TZ00', CurrentTemperature: 3192 },
  ]))
  assert.equal(zones.length, 1)
  assert.equal(zones[0].chip, 'acpi')
  assert.equal(zones[0].label, 'TZ00')
  assert.ok(Math.abs(zones[0].celsius - 46.05) < 0.01)
  assert.deepEqual(parseWindowsFans(JSON.stringify([
    { DeviceID: 'ACPI\\FAN0', DesiredSpeed: 1200 },
  ])), [{ chip: 'acpi', label: 'FAN0', rpm: 1200, maxRpm: null }])
})

test('parsePsProcesses preserves kernel threads and basenames executables', () => {
  const processes = parsePsProcesses([
    ' 124 swj 0.1 64 [kworker/0:1]',
    ' 123 swj 2.5 1024 /usr/bin/firefox',
  ].join('\n'))
  assert.equal(processes.length, 2)
  assert.equal(processes[0].name, '[kworker/0:1]')
  assert.equal(processes[1].name, 'firefox')
  assert.equal(processes[1].memoryBytes, 1024 * 1024)
})

test('parseLoadThreads reads the total scheduling entities', () => {
  assert.equal(parseLoadThreads('1.64 1.62 1.30 2/3978 47'), 3978)
  assert.equal(parseLoadThreads(''), null)
})

test('live snapshot matches the panel payload contract on this machine', async () => {
  const snapshot = await readSnapshot()
  assert.equal(snapshot.schemaVersion, 3)
  assert.equal(typeof snapshot.sampledAt, 'string')
  assert.equal(snapshot.platform, process.platform)
  assert.equal(typeof snapshot.os.name, 'string')
  assert.ok(snapshot.cpu !== null)
  assert.ok(snapshot.cpu.cores > 0)
  assert.equal(snapshot.cpu.perCore.length, snapshot.cpu.threads)
  assert.ok(snapshot.cpu.usage === null || (snapshot.cpu.usage >= 0 && snapshot.cpu.usage <= 100))
  assert.ok(snapshot.cpu.baseFrequencyMhz === null || snapshot.cpu.baseFrequencyMhz > 0)
  assert.ok(snapshot.memory !== null)
  assert.ok(snapshot.memory.totalBytes > 0)
  assert.ok(snapshot.memory.usedBytes >= 0)
  assert.equal(typeof snapshot.memory.usage, 'number')
  assert.ok(snapshot.memory.usage >= 0 && snapshot.memory.usage <= 100)
  assert.ok(Array.isArray(snapshot.disks))
  assert.ok(snapshot.disks.every((disk) => disk.totalBytes > 0 && disk.usedBytes >= 0))
  assert.equal(typeof snapshot.gpu.available, 'boolean')
  if (snapshot.gpu.available) {
    assert.ok(snapshot.gpu.usage >= 0 && snapshot.gpu.usage <= 100)
  } else {
    assert.ok(['not-detected', 'driver-unavailable', 'unsupported'].includes(snapshot.gpu.reason))
  }
  assert.ok(Array.isArray(snapshot.sensors))
  assert.ok(snapshot.network === null || typeof snapshot.network.interface === 'string')
  assert.ok(snapshot.processes === null || Array.isArray(snapshot.processes.top))
})
