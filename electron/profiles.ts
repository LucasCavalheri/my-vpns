import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CONFIG_DIR, parseVpnConfContent, type VpnProfile } from './vpn'
import { secureDirectory } from './nativeVpn'
import { confEntries } from './openconnect'

export interface VpnProfileDraft {
  id: string
  host: string
  port: number
  username: string
  password: string
  trustedCert: string
  setDns: boolean
  setRoutes: boolean
  realm: string
  persistent: number
  /** Preserve imported options that the visual editor does not expose. */
  extraOptions?: [string, string][]
}

export function emptyDraft(partial?: Partial<VpnProfileDraft>): VpnProfileDraft {
  return {
    id: '',
    host: '',
    port: 10443,
    username: '',
    password: '',
    trustedCert: '',
    setDns: false,
    setRoutes: true,
    realm: '',
    persistent: 0,
    ...partial,
  }
}

export function slugifyProfileId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\.conf$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function isValidProfileId(id: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,47}$/.test(id)
}

function parseConfMap(raw: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    map.set(
      trimmed.slice(0, eq).trim().toLowerCase(),
      trimmed.slice(eq + 1).trim(),
    )
  }
  return map
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback
  const v = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'off'].includes(v)) return false
  return fallback
}

/** Parse full draft (includes secrets) from conf text. */
export function parseVpnDraft(
  raw: string,
  filePathOrId: string,
): VpnProfileDraft | null {
  const map = parseConfMap(raw)
  const host = map.get('host')
  if (!host) return null

  const base = path.basename(filePathOrId).replace(/\.conf$/i, '')
  const id = isValidProfileId(base) ? base : slugifyProfileId(base) || 'vpn'

  return {
    id,
    host: host.trim(),
    port: Number.parseInt(map.get('port') ?? '443', 10) || 443,
    username: map.get('username') ?? map.get('user') ?? '',
    password: map.get('password') ?? '',
    trustedCert: map.get('trusted-cert') ?? '',
    setDns: parseBool(map.get('set-dns'), true),
    setRoutes: parseBool(map.get('set-routes'), true),
    realm: map.get('realm') ?? '',
    persistent: Number.parseInt(map.get('persistent') ?? '0', 10) || 0,
    extraOptions: confEntries(raw).filter(([key], index, entries) =>
      (key === 'trusted-cert' && index !== entries.findLastIndex(([k]) => k === 'trusted-cert')) ||
      !['host', 'port', 'username', 'user', 'password', 'trusted-cert', 'set-dns', 'set-routes', 'realm', 'persistent'].includes(key)),
  }
}

/** Serialize draft to openfortivpn .conf format (matches current user configs). */
export function serializeVpnDraft(draft: VpnProfileDraft): string {
  for (const value of [draft.host, draft.username, draft.password, draft.trustedCert, draft.realm]) {
    if (typeof value !== 'string' || /[\r\n]/.test(value) || value.includes('\0')) throw new Error('Profile fields must be single-line text.')
  }
  const lines: string[] = [
    `host = ${draft.host.trim()}`,
    `port = ${draft.port || 443}`,
    '',
    `username = ${draft.username.trim()}`,
  ]

  if (draft.password) {
    lines.push(`password = ${draft.password}`)
  }

  lines.push('')

  if (draft.trustedCert.trim()) {
    lines.push(`trusted-cert = ${draft.trustedCert.trim()}`)
    lines.push('')
  }

  if (draft.realm.trim()) {
    lines.push(`realm = ${draft.realm.trim()}`)
  }

  lines.push(`set-dns = ${draft.setDns ? 1 : 0}`)
  lines.push(`set-routes = ${draft.setRoutes ? 1 : 0}`)

  if (draft.persistent > 0) {
    lines.push(`persistent = ${draft.persistent}`)
  }

  for (const [key, value] of draft.extraOptions || []) {
    if (!/^[a-z][a-z0-9-]*$/.test(key) || /[\r\n]/.test(value) || value.includes('\0')) throw new Error('Invalid extra profile option.')
    if (['host', 'port', 'username', 'user', 'password', 'set-dns', 'set-routes', 'realm', 'persistent'].includes(key)) {
      throw new Error(`Duplicate profile option: ${key}`)
    }
    lines.push(`${key} = ${value}`)
  }

  lines.push('')
  return lines.join('\n')
}

export function confPathForId(id: string): string {
  if (!isValidProfileId(id)) throw new Error('Invalid profile id.')
  return path.join(CONFIG_DIR, `${id}.conf`)
}

export function readProfileDraft(id: string): VpnProfileDraft | null {
  const filePath = confPathForId(id)
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return parseVpnDraft(raw, filePath)
  } catch {
    return null
  }
}

function runPkexec(args: string[], stdin?: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn('pkexec', args, {
      env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
      stdio: stdin != null ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    })

    let output = ''
    const onChunk = (chunk: Buffer) => {
      output += chunk.toString('utf8')
    }
    child.stdout?.on('data', onChunk)
    child.stderr?.on('data', onChunk)

    if (stdin != null && child.stdin) {
      child.stdin.write(stdin)
      child.stdin.end()
    }

    child.on('error', (err) => resolve({ code: 1, output: err.message }))
    child.on('close', (code) => resolve({ code, output: output.trim() }))
  })
}

export async function saveProfileDraft(
  draft: VpnProfileDraft,
  options?: { overwrite?: boolean },
): Promise<{ ok: boolean; message: string; profile?: VpnProfile }> {
  const id = isValidProfileId(draft.id) ? draft.id : slugifyProfileId(draft.id)
  if (!isValidProfileId(id)) {
    return {
      ok: false,
      message: 'Invalid profile id. Use letters, numbers, - or _.',
    }
  }
  if (!draft.host.trim()) {
    return { ok: false, message: 'Host is required.' }
  }

  const dest = confPathForId(id)
  if (!options?.overwrite && fs.existsSync(dest)) {
    return {
      ok: false,
      message: `Profile "${id}" already exists.`,
    }
  }

  const content = serializeVpnDraft({ ...draft, id })
  if (process.platform !== 'linux') {
    try {
      await secureDirectory(CONFIG_DIR)
      fs.writeFileSync(dest, content, { mode: 0o600, flag: options?.overwrite ? 'w' : 'wx' })
      const profile = parseVpnConfContent(content, dest)!
      return { ok: true, message: `Saved ${dest}`, profile }
    } catch (err) { return { ok: false, message: err instanceof Error ? err.message : String(err) } }
  }
  const tmp = path.join(os.tmpdir(), `my-vpns-${id}-${Date.now()}.conf`)
  fs.writeFileSync(tmp, content, { mode: 0o600 })

  try {
    // install(1) copies with mode; needs root for /etc/openfortivpn
    const { code, output } = await runPkexec([
      'install',
      '-m',
      '0644',
      '-D',
      tmp,
      dest,
    ])

    if (code !== 0) {
      return {
        ok: false,
        message:
          code === 126 || code === 127
            ? 'Authentication cancelled.'
            : output || `Failed to write ${dest}`,
      }
    }

    const profile = parseVpnConfContent(content, dest)
    if (!profile) {
      return { ok: false, message: 'Saved, but failed to re-parse profile.' }
    }

    return { ok: true, message: `Saved ${dest}`, profile }
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch {
      // ignore
    }
  }
}

export async function deleteProfileFile(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  const safe = isValidProfileId(id) ? id : slugifyProfileId(id)
  if (!isValidProfileId(safe)) {
    return { ok: false, message: 'Invalid profile id.' }
  }

  const dest = confPathForId(safe)
  if (!fs.existsSync(dest)) {
    return { ok: false, message: 'Profile file not found.' }
  }

  if (process.platform !== 'linux') {
    try {
      fs.unlinkSync(dest)
      return { ok: true, message: `Deleted ${dest}` }
    } catch (err) { return { ok: false, message: err instanceof Error ? err.message : String(err) } }
  }

  const { code, output } = await runPkexec(['rm', '-f', dest])
  if (code !== 0) {
    return {
      ok: false,
      message:
        code === 126 || code === 127
          ? 'Authentication cancelled.'
          : output || `Failed to delete ${dest}`,
    }
  }

  return { ok: true, message: `Deleted ${dest}` }
}

export function draftFromImportedFile(filePath: string): {
  ok: boolean
  message: string
  draft?: VpnProfileDraft
} {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const draft = parseVpnDraft(raw, filePath)
    if (!draft) {
      return { ok: false, message: 'Could not parse conf (host missing?).' }
    }
    return { ok: true, message: 'Parsed', draft }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}
