import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const AUTOSTART_DIR = path.join(os.homedir(), '.config', 'autostart')
const DESKTOP_FILE = path.join(AUTOSTART_DIR, 'my-vpns.desktop')

/** Resolve the command used in the XDG autostart .desktop file. */
export function resolveAutostartExec(): string {
  // Lazy import so unit tests can load pure helpers without Electron runtime
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron')

  if (app.isPackaged) {
    return `"${process.execPath}" --hidden`
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
  return DESKTOP_FILE
}
