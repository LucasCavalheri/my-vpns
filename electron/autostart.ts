import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const AUTOSTART_DIR = path.join(os.homedir(), '.config', 'autostart')
const DESKTOP_FILE = path.join(AUTOSTART_DIR, 'my-vpns.desktop')

/** Resolve the command used in the XDG autostart .desktop file. */
export function resolveAutostartExec(): string {
  // Lazy import so unit tests can load pure helpers without Electron runtime
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron')

  if (app.isPackaged) {
    // Prefer the postinst wrapper (handles spaces + --no-sandbox)
    if (fs.existsSync('/usr/bin/my-vpns')) {
      return '/usr/bin/my-vpns --hidden'
    }
    return `"${process.execPath}" --no-sandbox --hidden`
  }

  const electronBin = process.execPath
  const appRoot = process.env.APP_ROOT || process.cwd()
  return `"${electronBin}" "${appRoot}" --no-sandbox --hidden`
}

export function buildAutostartDesktopEntry(exec: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=My VPNs',
    'Comment=OpenFortiVPN control desk',
    'Comment[pt_BR]=Mesa de controle OpenFortiVPN',
    `Exec=${exec}`,
    'Terminal=false',
    'Categories=Network;Security;',
    'StartupNotify=false',
    'X-GNOME-Autostart-enabled=true',
    'X-GNOME-Autostart-Delay=3',
    '',
  ].join('\n')
}

export function isAutostartEnabled(): boolean {
  try {
    if (process.platform !== 'linux') {
      const { app } = require('electron') as typeof import('electron')
      return app.getLoginItemSettings(process.platform === 'win32' ? { path: process.execPath, args: ['--hidden'] } : undefined).openAtLogin
    }
    if (!fs.existsSync(DESKTOP_FILE)) return false
    const raw = fs.readFileSync(DESKTOP_FILE, 'utf8')
    if (/X-GNOME-Autostart-enabled\s*=\s*false/i.test(raw)) return false
    if (/Hidden\s*=\s*true/i.test(raw)) return false
    return /Exec\s*=/.test(raw)
  } catch {
    return false
  }
}

export function setAutostartEnabled(enabled: boolean): boolean {
  try {
    if (process.platform !== 'linux') {
      const { app } = require('electron') as typeof import('electron')
      if (!app.isPackaged) return false // Do not register a development checkout.
      app.setLoginItemSettings(process.platform === 'win32'
        ? { openAtLogin: enabled, path: process.execPath, args: ['--hidden'] }
        : { openAtLogin: enabled })
      return isAutostartEnabled() === enabled
    }
    if (!enabled) {
      if (fs.existsSync(DESKTOP_FILE)) fs.unlinkSync(DESKTOP_FILE)
      return true
    }

    fs.mkdirSync(AUTOSTART_DIR, { recursive: true })
    fs.writeFileSync(
      DESKTOP_FILE,
      buildAutostartDesktopEntry(resolveAutostartExec()),
      'utf8',
    )
    return true
  } catch (err) {
    console.error('[my-vpns] autostart write failed:', err)
    return false
  }
}

export function getAutostartPath(): string {
  if (process.platform === 'darwin') return 'System Settings > General > Login Items'
  if (process.platform === 'win32') return 'Windows Settings > Apps > Startup'
  return DESKTOP_FILE
}
