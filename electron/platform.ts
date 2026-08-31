import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type VpnEngine = 'openfortivpn' | 'openconnect'

export function engineForPlatform(platform = process.platform): VpnEngine {
  return platform === 'win32' ? 'openconnect' : 'openfortivpn'
}

export function configDirectory(platform = process.platform, home = os.homedir()): string {
  if (platform === 'linux') return '/etc/openfortivpn'
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'My VPNs', 'profiles')
  if (platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'My VPNs', 'profiles')
  throw new Error(`Unsupported platform: ${platform}`)
}

export function binaryCandidates(engine: VpnEngine, platform = process.platform): string[] {
  const paths = platform === 'win32' ? path.win32 : path.posix
  const name = engine + (platform === 'win32' ? '.exe' : '')
  const known = platform === 'win32'
    ? [process.env.ProgramW6432, process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
      .filter((p): p is string => Boolean(p)).map(p => paths.join(p, 'OpenConnect'))
    : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/usr/sbin', '/bin']
  // Prefer known install locations over an inherited GUI PATH.
  return [...new Set([...known, ...(process.env.PATH || '').split(platform === 'win32' ? ';' : ':')])]
    .filter(Boolean).map(dir => paths.join(dir, name))
}

export function findVpnBinary(engine = engineForPlatform()): string | null {
  return binaryCandidates(engine).find(candidate => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      return fs.statSync(candidate).isFile()
    } catch { return false }
  }) ?? null
}

export function helperPath(name: string): string {
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'helpers', name),
    path.join(process.env.APP_ROOT || process.cwd(), 'packaging', name),
  ].filter((p): p is string => Boolean(p))
  const found = candidates.find(p => fs.existsSync(p))
  if (!found) throw new Error(`Missing VPN helper: ${name}`)
  return found
}
