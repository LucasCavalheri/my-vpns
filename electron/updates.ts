export interface UpdateInfo {
  current: string
  latest: string
  url: string
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
}

export async function fetchLatestGithubRelease(
  owner: string,
  repo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ version: string; url: string } | null> {
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
  return {
    version: normalizeTag(data.tag_name),
    url: data.html_url || `https://github.com/${owner}/${repo}/releases`,
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
  }
}
