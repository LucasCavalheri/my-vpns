import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export type UpdateArtifactKind = 'windows' | 'macos' | 'deb' | 'rpm'

export interface UpdateArtifact {
  name: string
  url: string
  kind: UpdateArtifactKind
  digest?: string
}

export interface UpdateInfo {
  current: string
  latest: string
  url: string
  artifacts?: UpdateArtifact[]
}

/** Compare semver-ish strings (1.0.2, v1.0.2, 1.0.2-beta.1). Returns >0 if a>b. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .map((part) => {
        const n = Number.parseInt(part, 10)
        return Number.isFinite(n) ? n : 0
      })

  const pa = parse(a)
  const pb = parse(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

export function normalizeTag(tag: string): string {
  return tag.replace(/^v/i, '').trim()
}

type GithubRelease = {
  tag_name?: string
  html_url?: string
  draft?: boolean
  prerelease?: boolean
  assets?: GithubAsset[]
}

type GithubAsset = {
  name?: string
  browser_download_url?: string
  digest?: string
}

function artifactKind(name: string): UpdateArtifactKind | null {
  const lower = name.toLowerCase()
  if (lower.endsWith('.exe') && lower.includes('windows')) return 'windows'
  if ((lower.endsWith('.dmg') || lower.endsWith('.zip')) && lower.includes('-mac-')) return 'macos'
  if (lower.endsWith('.deb')) return 'deb'
  if (lower.endsWith('.rpm')) return 'rpm'
  return null
}

function releaseArtifacts(assets: GithubAsset[] | undefined): UpdateArtifact[] {
  if (!assets) return []
  return assets.flatMap((asset) => {
    const name = asset.name?.trim()
    const url = asset.browser_download_url?.trim()
    const kind = name ? artifactKind(name) : null
    if (!name || !url || !kind || !/^https:\/\/github\.com\//i.test(url)) return []
    return [{
      name,
      url,
      kind,
      ...(asset.digest?.toLowerCase().startsWith('sha256:')
        ? { digest: asset.digest.slice('sha256:'.length).toLowerCase() }
        : {}),
    }]
  })
}

export async function fetchLatestGithubRelease(
  owner: string,
  repo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ version: string; url: string; artifacts?: UpdateArtifact[] } | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`
  const res = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'my-vpns',
    },
  })
  if (!res.ok) return null
  const data = (await res.json()) as GithubRelease
  if (!data.tag_name || data.draft) return null
  const artifacts = releaseArtifacts(data.assets)
  return {
    version: normalizeTag(data.tag_name),
    url: data.html_url || `https://github.com/${owner}/${repo}/releases`,
    ...(artifacts.length > 0 ? { artifacts } : {}),
  }
}

export async function checkForAppUpdate(
  currentVersion: string,
  options?: {
    owner?: string
    repo?: string
    fetchImpl?: typeof fetch
  },
): Promise<UpdateInfo | null> {
  const owner = options?.owner ?? 'LucasCavalheri'
  const repo = options?.repo ?? 'my-vpns'
  const latest = await fetchLatestGithubRelease(
    owner,
    repo,
    options?.fetchImpl,
  )
  if (!latest) return null
  if (compareVersions(latest.version, currentVersion) <= 0) return null
  return {
    current: normalizeTag(currentVersion),
    latest: latest.version,
    url: latest.url,
    ...(latest.artifacts ? { artifacts: latest.artifacts } : {}),
  }
}

/** Pick the package that matches the current operating system and architecture. */
export function selectUpdateArtifact(
  artifacts: UpdateArtifact[],
  platform = process.platform,
  arch = process.arch,
  packageFamily?: string,
): UpdateArtifact | null {
  if (platform === 'win32') {
    if (arch !== 'x64') return null
    return artifacts.find((asset) => asset.kind === 'windows' && /windows-x64/i.test(asset.name)) ?? null
  }
  if (platform === 'darwin') {
    if (arch !== 'x64' && arch !== 'arm64') return null
    const suffix = arch === 'arm64' ? 'mac-arm64' : 'mac-x64'
    // ZIP can be unpacked by the helper without requiring Finder interaction.
    return artifacts.find((asset) => asset.kind === 'macos' && asset.name.includes(suffix) && asset.name.toLowerCase().endsWith('.zip'))
      ?? artifacts.find((asset) => asset.kind === 'macos' && asset.name.includes(suffix))
      ?? null
  }
  if (platform === 'linux') {
    if (arch !== 'x64') return null
    const kind = packageFamily === 'apt' ? 'deb' : packageFamily && ['dnf', 'yum', 'zypper'].includes(packageFamily) ? 'rpm' : null
    return (kind ? artifacts.find((asset) => asset.kind === kind) : null)
      ?? artifacts.find((asset) => asset.kind === 'deb')
      ?? artifacts.find((asset) => asset.kind === 'rpm')
      ?? null
  }
  return null
}

export async function downloadUpdateArtifact(
  artifact: UpdateArtifact,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!/^https:\/\/github\.com\//i.test(artifact.url)) {
    throw new Error('Fonte de atualização não confiável')
  }
  if (path.basename(artifact.name) !== artifact.name || !/^[a-zA-Z0-9._-]+$/.test(artifact.name)) {
    throw new Error('Nome de instalador inválido')
  }
  const response = await fetchImpl(artifact.url, {
    headers: { Accept: 'application/octet-stream', 'User-Agent': 'my-vpns' },
  })
  if (!response.ok) throw new Error(`Download da atualização falhou (HTTP ${response.status})`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > 500 * 1024 * 1024) throw new Error('Atualização excede o tamanho permitido')
  if (artifact.digest) {
    const digest = crypto.createHash('sha256').update(bytes).digest('hex').toLowerCase()
    if (digest !== artifact.digest.toLowerCase()) throw new Error('A assinatura SHA-256 da atualização não confere')
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-vpns-update-'))
  const target = path.join(dir, artifact.name)
  await fs.writeFile(target, bytes, { mode: 0o700 })
  return target
}
