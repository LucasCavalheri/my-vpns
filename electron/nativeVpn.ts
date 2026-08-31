import { EventEmitter } from 'node:events'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildOpenConnectPlan, confEntries, resolveServerPin } from './openconnect'
import { findVpnBinary, helperPath } from './platform'

const execFileAsync = promisify(execFile)
export const powershellPath = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
export function psQuote(text: string): string { return "'" + text.replaceAll("'", "''") + "'" }
export function shQuote(text: string): string { return "'" + text.replaceAll("'", "'\\''") + "'" }
export function encodedPowerShell(script: string): string[] {
  return ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]
}

export async function secureDirectory(dir: string): Promise<void> {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32') { fs.chmodSync(dir, 0o700); return }
  const { stdout } = await execFileAsync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { windowsHide: true })
  const sid = stdout.match(/S-1-5-[\d-]+/)?.[0]
  if (!sid) throw new Error('Could not identify the current Windows user for profile permissions.')
  await execFileAsync('icacls.exe', [dir, '/inheritance:r', '/grant:r',
    `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'], { windowsHide: true })
}

/** One elevation per tunnel. The UI stays unprivileged. A heartbeat lets the
 * privileged supervisor clean up routes/DNS even if Electron crashes. */
export class NativeVpnSession extends EventEmitter {
  private dir = ''
  private launcher: ChildProcess | null = null
  private poll: NodeJS.Timeout | null = null
  private offsets = new Map<string, number>()
  private pending = new Map<string, string>()
  private stopping = false
  private finished = false
  private done: Promise<void>
  private resolveDone!: () => void
  persistent = 0
  canReconnect = false

  constructor() {
    super()
    this.done = new Promise(resolve => { this.resolveDone = resolve })
  }

  async start(configPath: string): Promise<void> {
    try {
      const bin = findVpnBinary()
      if (!bin) throw new Error('VPN client not installed. Open setup and install the required client.')
      const raw = fs.readFileSync(configPath, 'utf8')
      const root = path.join(os.tmpdir(), 'my-vpns-sessions')
      await secureDirectory(root)
      this.dir = fs.mkdtempSync(path.join(root, 'session-'))
      await secureDirectory(this.dir)
      if (this.stopping) { this.finish(0); return }
      const heartbeat = path.join(this.dir, 'heartbeat')
      fs.writeFileSync(heartbeat, '', { mode: 0o600 })
      // Precreate as the desktop user: a root helper must not create unreadable
      // root-only logs or status files on macOS.
      for (const name of ['stdout.log', 'stderr.log', 'exit-code']) {
        fs.writeFileSync(path.join(this.dir, name), name === 'exit-code' ? '1' : '', { mode: 0o600 })
      }
      let command: string
      let args: string[]
      if (process.platform === 'win32') {
        const plan = buildOpenConnectPlan(raw)
        const pin = await resolveServerPin(plan)
        if (this.stopping) { this.finish(0); return }
        if (pin) plan.args.unshift(`--servercert=${pin}`)
        // A dedicated interface allows independent simultaneous connections.
        plan.args.unshift(`--interface=MyVPNs-${path.basename(this.dir).slice(-6)}`)
        plan.args.unshift(`--script=${helperPath('vpnc-script-win.js')}`)
        this.persistent = plan.persistent
        fs.writeFileSync(path.join(this.dir, 'job.json'), JSON.stringify({ bin, ...plan }), { mode: 0o600 })
        const inner = encodedPowerShell(`& ${psQuote(helperPath('windows-vpn.ps1'))} -SessionDir ${psQuote(this.dir)}`)
        command = powershellPath
        args = encodedPowerShell(`$ErrorActionPreference = 'Stop'; try { $p = Start-Process -FilePath ${psQuote(powershellPath)} -ArgumentList ${psQuote(inner.join(' '))} -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 126 }`)
      } else {
        // Do not allow .conf options that load executable pppd plugins or write
        // arbitrary privileged log/config files. The root helper checks again.
        const allowed = new Set(['host', 'port', 'username', 'user', 'password', 'trusted-cert', 'set-dns', 'set-routes',
          'realm', 'persistent', 'ca-file', 'user-cert', 'user-key', 'otp', 'otp-prompt', 'otp-delay', 'pinentry',
          'pppd-use-peerdns', 'pppd-accept-remote', 'half-internet-routes', 'min-tls', 'cipher-list', 'seclevel', 'saml-login'])
        allowed.delete('pinentry') // Executables must never come from imported profiles.
        const invalid = confEntries(raw).filter(([k]) => !allowed.has(k)).map(([k]) => k)
        if (invalid.length) throw new Error(`Unsupported or unsafe .conf options on macOS: ${invalid.join(', ')}`)
        this.persistent = Math.max(0, Number(new Map(confEntries(raw)).get('persistent')) || 0)
        fs.writeFileSync(path.join(this.dir, 'profile.conf'), raw, { mode: 0o600 })
        const shellCommand = ['/bin/bash', helperPath('macos-vpn.sh'), this.dir, bin].map(shQuote).join(' ')
        command = '/usr/bin/osascript'
        args = ['-e', `do shell script ${JSON.stringify(shellCommand)} with administrator privileges`]
      }
      this.poll = setInterval(() => {
        try { fs.utimesSync(heartbeat, new Date(), new Date()) } catch { /* helper completed */ }
        this.readLogs()
      }, 250)
      this.launcher = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      this.canReconnect = true
      let errorOutput = ''
      this.launcher.stderr?.on('data', (chunk: Buffer) => { errorOutput = (errorOutput + chunk.toString()).slice(-4000) })
      this.launcher.on('error', err => { this.emit('line', `ERROR: ${err.message}`); this.finish(1) })
      this.launcher.on('close', code => {
        if (errorOutput.trim()) this.emit('line', errorOutput.trim())
        let result = code ?? 1
        try { result = Number(fs.readFileSync(path.join(this.dir, 'exit-code'), 'utf8').trim()) } catch { /* launch failure */ }
        if (code === 126 || errorOutput.includes('(-128)')) result = 126
        this.finish(Number.isFinite(result) ? result : 1)
      })
    } catch (err) {
      this.emit('line', `ERROR: ${err instanceof Error ? err.message : String(err)}`)
      this.finish(1)
    }
  }

  async stop(): Promise<void> {
    this.stopping = true
    if (this.dir && !this.finished) fs.writeFileSync(path.join(this.dir, 'stop'), '', { mode: 0o600 })
    // Do not kill osascript/PowerShell: the supervisor must finish network cleanup.
    await this.done
  }

  private readLogs(flush = false): void {
    for (const name of ['stdout.log', 'stderr.log']) {
      const file = path.join(this.dir, name)
      try {
        const size = fs.statSync(file).size
        const offset = this.offsets.get(name) || 0
        if (size > offset) {
          const fd = fs.openSync(file, 'r')
          const bytes = Buffer.alloc(Math.min(size - offset, 1024 * 1024))
          const count = fs.readSync(fd, bytes, 0, bytes.length, offset)
          fs.closeSync(fd)
          this.offsets.set(name, offset + count)
          const lines = ((this.pending.get(name) || '') + bytes.subarray(0, count).toString('utf8')).split(/\r?\n/)
          this.pending.set(name, lines.pop() || '')
          for (const line of lines) {
            if (/invalid credentials|authentication failed|could not authenticate|user input required|certificate.*(failed|mismatch)/i.test(line)) this.canReconnect = false
            if (line.trim()) this.emit('line', line.trim())
          }
        }
        if (flush && this.pending.get(name)) { this.emit('line', this.pending.get(name)); this.pending.delete(name) }
      } catch { /* logs appear after elevation */ }
    }
  }

  private finish(code: number): void {
    if (this.finished) return
    this.finished = true
    if (this.poll) clearInterval(this.poll)
    this.readLogs(true)
    // Only remove known files in our unique session directory; never recurse.
    if (this.dir) {
      for (const name of ['job.json', 'profile.conf', 'heartbeat', 'stop', 'exit-code', 'stdout.log', 'stderr.log']) {
        try { fs.unlinkSync(path.join(this.dir, name)) } catch { /* best effort */ }
      }
      try { fs.rmdirSync(this.dir) } catch { /* preserve unexpected files */ }
    }
    this.resolveDone()
    this.emit('close', code)
  }
}
