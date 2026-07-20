import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type PackageFamily =
  | 'apt'
  | 'dnf'
  | 'yum'
  | 'zypper'
  | 'pacman'
  | 'unknown'

export interface DistroInfo {
  id: string
  name: string
  version: string
  like: string[]
  family: PackageFamily
  pretty: string
}

export interface DependencyStatus {
  openfortivpnInstalled: boolean
  openfortivpnPath: string | null
  openfortivpnVersion: string | null
  distro: DistroInfo
  canAutoInstall: boolean
  installCommand: string | null
}

export interface InstallResult {
  ok: boolean
  code: number | null
  output: string
  status: DependencyStatus
}

/** Pure parser for /etc/os-release content. */
export function parseOsReleaseText(raw: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq)
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    map[key] = value
  }
  return map
}

function parseOsRelease(): Record<string, string> {
  const candidates = ['/etc/os-release', '/usr/lib/os-release']
  for (const file of candidates) {
    try {
      return parseOsReleaseText(fs.readFileSync(file, 'utf8'))
    } catch {
      // try next
    }
  }
  return {}
}

/** Pure package-family detection (optional binary probes via exists). */
export function detectPackageFamily(
  id: string,
  like: string[],
  exists: (binPath: string) => boolean = fs.existsSync,
): PackageFamily {
  const tokens = [id, ...like].map((t) => t.toLowerCase())

  if (
    tokens.some((t) =>
      [
        'debian',
        'ubuntu',
        'linuxmint',
        'pop',
        'elementary',
        'raspbian',
        'zorin',
      ].includes(t),
    )
  ) {
    return 'apt'
  }
  if (
    tokens.some((t) =>
      [
        'fedora',
        'rhel',
        'centos',
        'rocky',
        'almalinux',
        'ol',
        'nobara',
      ].includes(t),
    )
  ) {
    if (exists('/usr/bin/dnf') || exists('/usr/bin/dnf5')) return 'dnf'
    if (exists('/usr/bin/yum')) return 'yum'
    return 'dnf'
  }
  if (tokens.some((t) => t.includes('suse') || t === 'opensuse' || t === 'sles')) {
    return 'zypper'
  }
  if (
    tokens.some((t) =>
      ['arch', 'manjaro', 'endeavouros', 'garuda', 'artix'].includes(t),
    )
  ) {
    return 'pacman'
  }

  if (exists('/usr/bin/apt-get')) return 'apt'
  if (exists('/usr/bin/dnf') || exists('/usr/bin/dnf5')) return 'dnf'
  if (exists('/usr/bin/yum')) return 'yum'
  if (exists('/usr/bin/zypper')) return 'zypper'
  if (exists('/usr/bin/pacman')) return 'pacman'

  return 'unknown'
}

export function buildInstallPlan(family: PackageFamily): {
  canAutoInstall: boolean
  installCommand: string | null
  pkexecArgs: string[] | null
} {
  switch (family) {
    case 'apt':
      return {
        canAutoInstall: true,
        installCommand: 'apt-get install -y openfortivpn',
        pkexecArgs: [
          'env',
          'DEBIAN_FRONTEND=noninteractive',
          'apt-get',
          'install',
          '-y',
          'openfortivpn',
        ],
      }
    case 'dnf':
      return {
        canAutoInstall: true,
        installCommand: 'dnf install -y openfortivpn',
        pkexecArgs: ['dnf', 'install', '-y', 'openfortivpn'],
      }
    case 'yum':
      return {
        canAutoInstall: true,
        installCommand: 'yum install -y openfortivpn',
        pkexecArgs: ['yum', 'install', '-y', 'openfortivpn'],
      }
    case 'zypper':
      return {
        canAutoInstall: true,
        installCommand: 'zypper --non-interactive install openfortivpn',
        pkexecArgs: [
          'zypper',
          '--non-interactive',
          'install',
          'openfortivpn',
        ],
      }
    case 'pacman':
      return {
        canAutoInstall: true,
        installCommand: 'pacman -S --noconfirm openfortivpn',
        pkexecArgs: ['pacman', '-S', '--noconfirm', 'openfortivpn'],
      }
    default:
      return {
        canAutoInstall: false,
        installCommand: null,
        pkexecArgs: null,
      }
  }
}

export function detectDistro(): DistroInfo {
  const os = parseOsRelease()
  const id = (os.ID ?? 'linux').toLowerCase()
  const like = (os.ID_LIKE ?? '')
    .split(/\s+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const name = os.NAME ?? id
  const version = os.VERSION_ID ?? os.VERSION ?? ''
  const family = detectPackageFamily(id, like)
  const pretty = os.PRETTY_NAME ?? `${name} ${version}`.trim()

  return { id, name, version, like, family, pretty }
}

function whichSync(bin: string): string | null {
  const dirs = (process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin')
    .split(':')
    .filter(Boolean)
  for (const dir of dirs) {
    const full = `${dir}/${bin}`
    try {
      fs.accessSync(full, fs.constants.X_OK)
      return full
    } catch {
      // continue
    }
  }
  return null
}

async function readOpenfortivpnVersion(bin: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, ['--version'], {
      timeout: 5000,
    })
    const text = `${stdout}\n${stderr}`.trim()
    const line = text.split(/\r?\n/).find(Boolean)
    return line ?? null
  } catch {
    return null
  }
}

export async function getDependencyStatus(): Promise<DependencyStatus> {
  const distro = detectDistro()
  const plan = buildInstallPlan(distro.family)
  const openfortivpnPath = whichSync('openfortivpn')
  const openfortivpnInstalled = Boolean(openfortivpnPath)
  const openfortivpnVersion = openfortivpnPath
    ? await readOpenfortivpnVersion(openfortivpnPath)
    : null

  return {
    openfortivpnInstalled,
    openfortivpnPath,
    openfortivpnVersion,
    distro,
    canAutoInstall: plan.canAutoInstall,
    installCommand: plan.installCommand,
  }
}

function runPkexec(args: string[]): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn('pkexec', args, {
      env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let output = ''
    const onChunk = (chunk: Buffer) => {
      output += chunk.toString('utf8')
      if (output.length > 20_000) output = output.slice(-20_000)
    }

    child.stdout?.on('data', onChunk)
    child.stderr?.on('data', onChunk)
    child.on('error', (err) => resolve({ code: 1, output: err.message }))
    child.on('close', (code) => resolve({ code, output: output.trim() }))
  })
}

export async function installOpenfortivpn(
  onLog?: (line: string) => void,
): Promise<InstallResult> {
  const before = await getDependencyStatus()
  if (before.openfortivpnInstalled) {
    return { ok: true, code: 0, output: 'Já instalado', status: before }
  }

  const plan = buildInstallPlan(before.distro.family)
  if (!plan.pkexecArgs) {
    return {
      ok: false,
      code: 1,
      output:
        'Distro não suportada para instalação automática. Instale o openfortivpn manualmente.',
      status: before,
    }
  }

  onLog?.(`Distro detectada: ${before.distro.pretty}`)
  onLog?.(`Família de pacotes: ${before.distro.family}`)
  onLog?.(`Comando: pkexec ${plan.pkexecArgs.join(' ')}`)

  const { code, output } = await runPkexec(plan.pkexecArgs)
  if (output) {
    for (const line of output.split(/\r?\n/)) {
      if (line.trim()) onLog?.(line.trim())
    }
  }

  const status = await getDependencyStatus()

  if (!status.openfortivpnInstalled && (code === 126 || code === 127)) {
    return {
      ok: false,
      code,
      output: 'Autenticação cancelada ou pkexec indisponível.',
      status,
    }
  }

  return {
    ok: status.openfortivpnInstalled,
    code,
    output:
      output ||
      (status.openfortivpnInstalled
        ? 'Instalação concluída'
        : 'Falha ao instalar openfortivpn'),
    status,
  }
}
