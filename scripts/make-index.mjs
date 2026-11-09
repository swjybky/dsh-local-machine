#!/usr/bin/env node
/**
 * Write `docs/index.json` — a DSH plugin market index in format 1 — from this
 * package's manifest and the current Git commit.
 *
 * Run it after committing the package and before publishing the index:
 *   node scripts/make-index.mjs
 *
 * The Git source points at HEAD, so the index always installs exactly the
 * commit it was generated from. Running it again keeps older versions in the
 * list and updates the entry for the manifest's current version.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repository this package is published from. */
const REPOSITORY = 'https://github.com/swjybky/dsh-local-machine'
/** Index metadata; edit these strings to change the catalogue entry. */
const INDEX = {
  title: { en: 'swjybky plugins', zh: 'swjybky 插件' },
  description: { en: 'DSH bundles published by swjybky.', zh: 'swjybky 发布的 DSH 插件。' },
  categories: { system: { title: { en: 'System', zh: '系统' } } },
  labels: { 'open-source': { title: { en: 'Open source', zh: '开源' } } },
}
/** Display metadata of this plugin. */
const PLUGIN = {
  title: { en: 'Local machine', zh: '本机管理' },
  description: {
    en: 'System dashboard: CPU, memory, GPU, disk, network, sensors, and top processes with live refresh and trends.',
    zh: '本机系统面板：CPU、内存、GPU、磁盘、网络、温度与进程实时监控。',
  },
  author: 'swjybky',
  category: 'system',
  keywords: ['cpu', 'memory', 'gpu', 'disk', 'network', 'processes', 'sidebar', 'monitoring'],
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(root, 'package.json')
const docsDir = join(root, 'docs')
const indexPath = join(docsDir, 'index.json')

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
if (!/^[0-9a-f]{40}$/u.test(commit)) throw new Error(`not a full commit sha: ${commit}`)

/** Read the previous index, so earlier versions survive a regeneration. */
const previous = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : ''
const kept = new Map()
try {
  const parsed = JSON.parse(previous)
  for (const entry of parsed?.plugins?.[0]?.versions ?? []) {
    if (typeof entry?.version === 'string') kept.set(entry.version, entry)
  }
} catch {
  // A missing or unreadable previous index simply starts from the current version.
}

kept.set(manifest.version, {
  version: manifest.version,
  publishTimestamp: Math.floor(Date.now() / 1000),
  source: { type: 'git', url: REPOSITORY, commit },
  ...(typeof manifest.engines?.dsh === 'string' ? { engines: { dsh: manifest.engines.dsh } } : {}),
})

const index = {
  format: 1,
  title: INDEX.title,
  description: INDEX.description,
  metadata: {
    categories: INDEX.categories,
    labels: INDEX.labels,
  },
  plugins: [
    {
      name: manifest.name,
      title: PLUGIN.title,
      description: PLUGIN.description,
      icon: './icon.svg',
      author: PLUGIN.author,
      homepage: REPOSITORY,
      repository: { url: REPOSITORY },
      metadata: {
        category: PLUGIN.category,
        keywords: PLUGIN.keywords,
        labels: ['open-source'],
      },
      versions: [...kept.values()].sort(compareVersions),
    },
  ],
}

mkdirSync(docsDir, { recursive: true })
copyFileSync(join(root, 'icon.svg'), join(docsDir, 'icon.svg'))
writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`)

console.log(`wrote docs/index.json — ${manifest.name}@${manifest.version} at ${commit}`)

/**
 * Order versions newest first; `parseMarketIndex` re-sorts with full SemVer rules.
 * @param left - one version entry.
 * @param right - the other version entry.
 * @returns Negative when `left` sorts first.
 */
function compareVersions(left, right) {
  const a = parseVersion(left.version)
  const b = parseVersion(right.version)
  for (let i = 0; i < 3; i += 1) {
    if (a.numbers[i] !== b.numbers[i]) return b.numbers[i] - a.numbers[i]
  }
  if (a.prerelease === b.prerelease) return 0
  if (a.prerelease === '') return -1
  if (b.prerelease === '') return 1
  return a.prerelease < b.prerelease ? 1 : -1
}

/**
 * Split a version into its three numbers and its prerelease tag.
 * @param version - exact SemVer version.
 * @returns Comparable parts.
 */
function parseVersion(version) {
  const [core, prerelease = ''] = String(version).split('-', 2)
  const numbers = core.split('.').map((part) => Number.parseInt(part, 10) || 0)
  while (numbers.length < 3) numbers.push(0)
  return { numbers, prerelease }
}
