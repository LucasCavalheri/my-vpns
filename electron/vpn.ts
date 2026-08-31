import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { configDirectory } from './platform'
import { NativeVpnSession } from './nativeVpn'

export const CONFIG_DIR = configDirectory()

export type VpnStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface VpnProfile {
  id: string
  name: string
  path: string
  host: string
  port: number
  username: string
  setDns: boolean
  setRoutes: boolean
  hasPassword: boolean
  hasTrustedCert: boolean
}

export interface VpnSession {
  profileId: string
  status: VpnStatus
  message: string
  connectedAt: number | null
}

export interface VpnState {
  /** Sessões ativas por perfil — várias VPNs podem rodar juntas. */
  sessions: Record<string, VpnSession>
  autoReconnect: boolean
}

interface LiveSession {
  profile: VpnProfile
  proc: ChildProcess | null
  native?: NativeVpnSession
  persistent?: number
  intentionalStop: boolean
  reconnectTimer: NodeJS.Timeout | null
  status: VpnStatus
  message: string
  connectedAt: number | null
}

const CONNECTED_MARKERS = [
  'tunnel is up and running',
  'tunnel interface is up',
  'myvpns_tunnel_up',
]

const ERROR_MARKERS = [
  'could not authenticate',
  'authentication failed',
  'invalid credentials',
  'user input required',
  'permission denied',
  'failed to',
  'error:',
  'unable to',
  'not authorized',
]

function displayName(fileName: string): string {
  const base = fileName.replace(/\.conf$/i, '')
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback
  const v = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'off'].includes(v)) return false
  return fallback
}

function parseConfMap(raw: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim().toLowerCase()
    const value = trimmed.slice(eq + 1).trim()
    map.set(key, value)
  }
  return map
}

/** Pure parser — used by unit tests and file loader. */
export function parseVpnConfContent(
  raw: string,
  filePath: string,
): VpnProfile | null {
  const map = parseConfMap(raw)
  const fileName = path.basename(filePath)
  const id = fileName.replace(/\.conf$/i, '')
  const host = map.get('host')
  if (!host) return null

  const username = map.get('username') ?? map.get('user') ?? ''

  return {
    id,
    name: displayName(fileName),
    path: filePath,
    host: host.trim(),
    port: Number.parseInt(map.get('port') ?? '443', 10) || 443,
    username,
    setDns: parseBool(map.get('set-dns'), true),
    setRoutes: parseBool(map.get('set-routes'), true),
    hasPassword: Boolean(map.get('password')),
    hasTrustedCert: Boolean(map.get('trusted-cert')),
  }
}

function parseConf(filePath: string): VpnProfile | null {
  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
  return parseVpnConfContent(raw, filePath)
}

export function interpretVpnLogLine(
  line: string,
): 'connected' | 'error' | null {
  const lower = line.toLowerCase()
  if (CONNECTED_MARKERS.some((m) => lower.includes(m))) return 'connected'
  if (ERROR_MARKERS.some((m) => lower.includes(m))) return 'error'
  return null
}

export function listVpnProfiles(configDir = CONFIG_DIR): VpnProfile[] {
  if (!fs.existsSync(configDir)) return []

  return fs
    .readdirSync(configDir)
    .filter((name) => name.endsWith('.conf'))
    .map((name) => parseConf(path.join(configDir, name)))
    .filter((p): p is VpnProfile => p != null)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export function summarizeVpnState(state: VpnState): {
  connectedCount: number
  connectingCount: number
  errorCount: number
  overall: VpnStatus
  message: string
} {
  const sessions = Object.values(state.sessions)
  const connectedCount = sessions.filter((s) => s.status === 'connected').length
  const connectingCount = sessions.filter((s) => s.status === 'connecting').length
  const errorCount = sessions.filter((s) => s.status === 'error').length

  let overall: VpnStatus = 'disconnected'
  if (connectedCount > 0) overall = 'connected'
  else if (connectingCount > 0) overall = 'connecting'
  else if (errorCount > 0) overall = 'error'

  const message =
    connectedCount + connectingCount === 0
      ? 'Nenhuma VPN ativa'
      : `${connectedCount} up · ${connectingCount} handshake`

  return { connectedCount, connectingCount, errorCount, overall, message }
}

function resolveHelpers(): { run: string; stop: string } | null {
  const installed = {
    run: '/usr/lib/my-vpns/run-vpn.sh',
    stop: '/usr/lib/my-vpns/stop-vpn.sh',
  }
  if (fs.existsSync(installed.run) && fs.existsSync(installed.stop)) {
    return installed
  }

  const roots = [
    process.resourcesPath ? path.join(process.resourcesPath, 'helpers') : null,
    process.env.APP_ROOT ? path.join(process.env.APP_ROOT, 'packaging') : null,
    path.join(path.dirname(fileURLToPathSafe()), '..', 'packaging'),
    path.join(process.cwd(), 'packaging'),
  ].filter(Boolean) as string[]

  for (const root of roots) {
    const run = path.join(root, 'run-vpn.sh')
    const stop = path.join(root, 'stop-vpn.sh')
    if (fs.existsSync(run) && fs.existsSync(stop)) {
      return { run, stop }
    }
  }

  return null
}

function fileURLToPathSafe(): string {
  try {
    return path.dirname(new URL(import.meta.url).pathname)
  } catch {
    return process.cwd()
  }
}

export class VpnManager extends EventEmitter {
  private live = new Map<string, LiveSession>()
  private profiles: VpnProfile[] = []
  private autoReconnect = false

  constructor() {
    super()
    this.refreshProfiles()
  }

  getState(): VpnState {
    const sessions: Record<string, VpnSession> = {}
    for (const [id, live] of this.live) {
      sessions[id] = {
        profileId: id,
        status: live.status,
        message: live.message,
        connectedAt: live.connectedAt,
      }
    }
    return { sessions, autoReconnect: this.autoReconnect }
  }

  getProfiles(): VpnProfile[] {
    return this.profiles.map((p) => ({ ...p }))
  }

  refreshProfiles(): VpnProfile[] {
    this.profiles = listVpnProfiles()
    this.emit('profiles', this.getProfiles())
    return this.getProfiles()
  }

  setAutoReconnect(enabled: boolean): void {
    this.autoReconnect = enabled
    this.emitState()
  }

  async connect(profileId: string): Promise<void> {
    const profile = this.profiles.find((p) => p.id === profileId)
    if (!profile) {
      this.emitLog(`✗ Perfil "${profileId}" não encontrado`)
      return
    }

    const existing = this.live.get(profileId)
    if (
      existing &&
      (existing.status === 'connected' || existing.status === 'connecting')
    ) {
      this.emitLog(`→ ${profile.name} já está ativa`)
      return
    }

    if (existing) {
      await this.disconnect(profileId)
    }

    const live: LiveSession = {
      profile,
      proc: null,
      intentionalStop: false,
      reconnectTimer: null,
      status: 'connecting',
      message: `Autenticando ${profile.name}…`,
      connectedAt: null,
    }
    this.live.set(profileId, live)
    this.emitState()

    this.emitLog(
      `→ Conectando ${profile.name} (${profile.host}:${profile.port})`,
    )
    this.emitLog(`→ Config: ${profile.path}`)

    if (process.platform === 'darwin' || process.platform === 'win32') {
      const native = new NativeVpnSession()
      live.native = native
      native.on('line', (line: string) => {
        if (this.live.get(profileId) !== live) return
        this.emitLog(`[${profile.id}] ${line}`)
        // Only the network helper confirms that routes and DNS were applied.
        if (line.includes('MYVPNS_TUNNEL_UP') || interpretVpnLogLine(line) === 'error') this.interpretLine(profileId, line)
      })
      native.on('close', (code: number) => {
        if (this.live.get(profileId) !== live) return
        live.native = undefined
        live.persistent = native.persistent
        if (live.intentionalStop) {
          this.live.delete(profileId)
        } else {
          const previousError = live.status === 'error' ? live.message : null
          live.status = 'error'
          live.connectedAt = null
          live.message = previousError || (code === 126 ? 'Autenticação cancelada' : `Conexão encerrada (código ${code})`)
          if (code !== 126 && native.canReconnect) this.scheduleReconnect(profileId)
        }
        this.emitState()
      })
      await native.start(profile.path)
      return
    }

    const helpers = resolveHelpers()
    const args = helpers
      ? [helpers.run, profile.path]
      : ['openfortivpn', '-c', profile.path]

    if (helpers) {
      this.emitLog(`→ Helper PolicyKit · ${profile.id}`)
    }

    const child = spawn('pkexec', args, {
      env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    live.proc = child

    const onChunk = (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed) continue
        this.emitLog(`[${profile.id}] ${trimmed}`)
        this.interpretLine(profileId, trimmed)
      }
    }

    child.stdout?.on('data', onChunk)
    child.stderr?.on('data', onChunk)

    child.on('error', (err) => {
      const current = this.live.get(profileId)
      if (!current || current.proc !== child) return

      this.emitLog(`✗ [${profile.id}] Erro ao iniciar: ${err.message}`)
      current.proc = null
      current.status = 'error'
      current.message = err.message
      current.connectedAt = null
      this.emitState()
      this.scheduleReconnect(profileId)
    })

    child.on('close', (code, signal) => {
      const current = this.live.get(profileId)
      if (!current || current.proc !== child) return

      const wasIntentional = current.intentionalStop
      current.proc = null

      const detail =
        signal != null
          ? `sinal ${signal}`
          : `código ${code ?? 'desconhecido'}`

      this.emitLog(`← [${profile.id}] Processo finalizado (${detail})`)

      if (wasIntentional) {
        this.live.delete(profileId)
        this.emitState()
        return
      }

      const cancelled = code === 126 || code === 127
      current.status = 'error'
      current.message = cancelled
        ? 'Autenticação cancelada'
        : `Conexão encerrada (${detail})`
      current.connectedAt = null
      this.emitState()

      if (!cancelled) {
        this.scheduleReconnect(profileId)
      }
    })
  }

  async disconnect(profileId?: string): Promise<void> {
    if (!profileId) {
      const ids = [...this.live.keys()]
      for (const id of ids) {
        await this.disconnect(id)
      }
      return
    }

    const live = this.live.get(profileId)
    if (!live) return

    this.clearReconnectTimer(live)
    live.intentionalStop = true

    this.emitLog(`→ [${profileId}] Solicitando desconexão…`)
    live.status = 'connecting'
    live.message = 'Encerrando túnel…'
    this.emitState()

    if (live.native) {
      await live.native.stop()
      this.live.delete(profileId)
      this.emitLog(`← [${profileId}] Desconectado`)
      this.emitState()
      return
    }
    if (!live.proc) {
      this.live.delete(profileId)
      this.emitState()
      return
    }
    await this.stopVpn(live.profile.path)

    if (live.proc) {
      try {
        live.proc.kill('SIGINT')
      } catch {
        // ignore
      }
      await this.waitForExit(live, 2500)
      if (live.proc) {
        try {
          live.proc.kill('SIGKILL')
        } catch {
          // ignore
        }
        live.proc = null
      }
    }

    this.live.delete(profileId)
    this.emitLog(`← [${profileId}] Desconectado`)
    this.emitState()
  }

  private stopVpn(configPath: string): Promise<void> {
    return new Promise((resolve) => {
      const helpers = resolveHelpers()
      const args = helpers
        ? [helpers.stop, configPath]
        : ['pkill', '-INT', '-f', `openfortivpn -c ${configPath}`]

      const killer = spawn('pkexec', args, { stdio: 'ignore' })
      const done = () => resolve()
      killer.on('close', done)
      killer.on('error', done)
      setTimeout(done, 4000)
    })
  }

  private interpretLine(profileId: string, line: string): void {
    const live = this.live.get(profileId)
    if (!live) return

    if (live.intentionalStop) return
    const kind = interpretVpnLogLine(line)
    if (kind === 'connected') {
      live.status = 'connected'
      live.message = 'Túnel ativo'
      live.connectedAt = Date.now()
      this.emitState()
      return
    }

    if (kind === 'error' && live.status !== 'connected') {
      live.status = 'error'
      live.message = line.slice(0, 120)
      this.emitState()
    }
  }

  private scheduleReconnect(profileId: string): void {
    const live = this.live.get(profileId)
    if (!live || (!this.autoReconnect && !live.persistent) || live.intentionalStop) return

    this.clearReconnectTimer(live)
    const delay = live.persistent ? live.persistent * 1000 : 4000
    this.emitLog(`↻ [${profileId}] Reconexão automática em ${delay / 1000}s…`)
    live.message = 'Aguardando reconexão automática…'
    this.emitState()

    live.reconnectTimer = setTimeout(() => {
      void this.connect(profileId)
    }, delay)
  }

  private clearReconnectTimer(live: LiveSession): void {
    if (live.reconnectTimer) {
      clearTimeout(live.reconnectTimer)
      live.reconnectTimer = null
    }
  }

  private waitForExit(live: LiveSession, ms: number): Promise<void> {
    return new Promise((resolve) => {
      if (!live.proc) {
        resolve()
        return
      }

      const child = live.proc
      const timer = setTimeout(() => {
        child.removeListener('close', onClose)
        resolve()
      }, ms)

      const onClose = () => {
        clearTimeout(timer)
        resolve()
      }

      child.once('close', onClose)
    })
  }

  private emitState(): void {
    this.emit('state', this.getState())
  }

  private emitLog(line: string): void {
    const stamp = new Date().toLocaleTimeString('pt-BR', { hour12: false })
    this.emit('log', `[${stamp}] ${line}`)
  }
}
