import {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  nativeImage,
  nativeTheme,
  ipcMain,
  shell,
  dialog,
  type MessageBoxOptions,
} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { VpnManager, summarizeVpnState, type VpnProfile, type VpnState } from './vpn'
import { encodedPowerShell, powershellPath, psQuote } from './nativeVpn'
import {
  detectDistro,
  getDependencyStatus,
  installVpnClient,
} from './deps'
import {
  getAutostartPath,
  isAutostartEnabled,
  setAutostartEnabled,
} from './autostart'
import {
  loadSettings,
  saveSettings,
  normalizeTheme,
  type AppLocale,
} from './settings'
import { translate } from '../src/i18n/messages'
import {
  deleteProfileFile,
  draftFromImportedFile,
  readProfileDraft,
  saveProfileDraft,
  type VpnProfileDraft,
} from './profiles'
import {
  checkForAppUpdate,
  downloadUpdateArtifact,
  selectUpdateArtifact,
  type UpdateInfo,
} from './updates'
import {
  nextCheckDelayMs,
  type UpdateScheduleState,
} from './updateScheduler'
import type { UpdateCheckResult } from '../src/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Ubuntu 24+ often blocks the Electron SUID sandbox; without this the app
// exits immediately when launched from the app menu.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
}
if (process.platform === 'win32') app.setAppUserModelId('dev.cavallheri.myvpns')

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

const startHidden =
  process.argv.includes('--hidden') || process.argv.includes('--autostart')

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let tunnelsStopped = false
const vpn = new VpnManager()
let lastConnected = new Set<string>()
let locale: AppLocale = 'en'

// --- Update check scheduling (pure math in ./updateScheduler) ---
let updateTimer: NodeJS.Timeout | null = null
const updateSchedule: UpdateScheduleState = {
  lastAttemptAt: null,
  consecutiveFailures: 0,
}
let notifiedVersion: string | null = null
let updateInProgress = false

function iconPath(): string {
  const candidates = [
    path.join(process.env.APP_ROOT!, 'build', 'icon.png'),
    path.join(process.env.VITE_PUBLIC!, 'icon.png'),
    path.join(__dirname, '../build/icon.png'),
  ]
  for (const candidate of candidates) {
    try {
      const img = nativeImage.createFromPath(candidate)
      if (!img.isEmpty()) return candidate
    } catch {
      // continue
    }
  }
  return ''
}

function resolvePreload(): string {
  const candidates = [
    path.join(__dirname, 'preload.cjs'),
    path.join(__dirname, 'preload.js'),
    path.join(__dirname, 'preload.mjs'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return candidates[0]
}

function t(
  key: Parameters<typeof translate>[1],
  vars?: Record<string, string | number>,
): string {
  return translate(locale, key, vars)
}

function createWindow(): void {
  const icon = iconPath()
  const preload = resolvePreload()

  if (!fs.existsSync(preload)) {
    console.error('[my-vpns] preload script missing:', preload)
  } else {
    console.log('[my-vpns] using preload:', preload)
  }

  mainWindow = new BrowserWindow({
    width: 980,
    height: 680,
    minWidth: 820,
    minHeight: 560,
    title: 'My VPNs',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0e1116' : '#f4f6f8',
    show: false,
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[my-vpns] preload error:', preloadPath, error)
  })

  mainWindow.on('ready-to-show', () => {
    const loginLaunch = process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin
    if (!startHidden && !loginLaunch) mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return
  new Notification({ title, body, silent: false, ...notificationIcon() }).show()
}

/** Without an explicit icon the toast falls back to the shell's default,
 * which is not the application mark outside a fully registered install. */
function notificationIcon(): { icon?: string } {
  const icon = iconPath()
  return icon ? { icon } : {}
}

function broadcastUpdate(info: UpdateInfo): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('updates:updateAvailable', info)
  }
}

function scheduleNextUpdateCheck(): void {
  if (updateTimer) clearTimeout(updateTimer)
  const delay = nextCheckDelayMs(updateSchedule)
  updateTimer = setTimeout(() => {
    void performUpdateCheck(false)
  }, delay)
}

/**
 * Runs one update check. Scheduled checks respect a previously dismissed
 * version and drive the retry cadence; manual checks always report the
 * truth so the user gets explicit feedback.
 */
async function performUpdateCheck(manual: boolean): Promise<UpdateCheckResult> {
  updateSchedule.lastAttemptAt = Date.now()
  try {
    const current = app.getVersion()
    const info = await checkForAppUpdate(current)
    updateSchedule.consecutiveFailures = 0
    if (!info) return { status: 'up-to-date', current }

    const dismissed = loadSettings().dismissedUpdateVersion
    const suppressed = !manual && dismissed === info.latest

    if (!suppressed) {
      broadcastUpdate(info)
      if (notifiedVersion !== info.latest && dismissed !== info.latest) {
        notifiedVersion = info.latest
        const notification = new Notification({
          title: t('notify.updateTitle'),
          body: t('notify.updateBody', {
            latest: info.latest,
            current: info.current,
          }),
          silent: false,
          ...notificationIcon(),
        })
        notification.on('click', () => {
          mainWindow?.show()
          mainWindow?.focus()
        })
        if (Notification.isSupported()) notification.show()
      }
    }

    return { status: 'available', info }
  } catch (err) {
    updateSchedule.consecutiveFailures += 1
    console.error('[my-vpns] update check failed:', err)
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    }
  } finally {
    if (!manual) scheduleNextUpdateCheck()
  }
}

function runUpdateProcess(
  command: string,
  args: string[],
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let output = ''
    const onChunk = (chunk: Buffer) => {
      output += chunk.toString('utf8')
      if (output.length > 20_000) output = output.slice(-20_000)
    }
    child.stdout?.on('data', onChunk)
    child.stderr?.on('data', onChunk)
    child.on('error', (error) => resolve({ code: 1, output: error.message }))
    child.on('close', (code) => resolve({ code, output: output.trim() }))
  })
}

function launchMacUpdater(archive: string): void {
  const bundle = path.resolve(app.getPath('exe'), '../../..')
  // The helper is deliberately a static shell script with positional arguments;
  // paths from the downloaded archive are never interpolated into shell code.
  const script = [
    'set -eu',
    'archive="$1"',
    'target="$2"',
    'tmp="$(mktemp -d -t my-vpns-unpack)"',
    'trap \'rm -rf "$tmp"\' EXIT',
    'ditto -x -k "$archive" "$tmp"',
    'new="$(find "$tmp" -maxdepth 2 -type d -name \'*.app\' -print -quit)"',
    '[ -n "$new" ]',
    'sleep 1',
    'rm -rf "$target"',
    'ditto "$new" "$target"',
    'open "$target"',
  ].join('\n')
  const child = spawn('sh', ['-c', script, 'my-vpns-updater', archive, bundle], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  // A spawn failure is reported asynchronously; without a listener it becomes
  // an uncaught exception that takes down the whole main process.
  child.on('error', (error) => console.error('[my-vpns] update helper failed:', error))
  child.unref()
}

function linuxUpdateArgs(artifact: NonNullable<UpdateInfo['artifacts']>[number], file: string): string[] | null {
  const family = detectDistro().family
  if (artifact.kind === 'deb' && family === 'apt') {
    return ['env', 'DEBIAN_FRONTEND=noninteractive', 'apt-get', 'install', '-y', file]
  }
  if (artifact.kind === 'rpm' && family === 'dnf') return ['dnf', 'install', '-y', file]
  if (artifact.kind === 'rpm' && family === 'yum') return ['yum', 'install', '-y', file]
  if (artifact.kind === 'rpm' && family === 'zypper') {
    return ['zypper', '--non-interactive', 'install', file]
  }
  return null
}

async function installAppUpdate(info: UpdateInfo): Promise<{
  status: 'started' | 'unsupported' | 'error'
  message?: string
}> {
  if (updateInProgress) return { status: 'error', message: 'Outra atualização já está em andamento.' }
  const artifact = selectUpdateArtifact(
    info.artifacts ?? [],
    process.platform,
    process.arch,
    process.platform === 'linux' ? detectDistro().family : undefined,
  )
  if (!artifact) {
    return {
      status: 'unsupported',
      message: 'Não há um instalador compatível com este sistema nesta release.',
    }
  }

  const prompt: MessageBoxOptions = {
    type: 'question',
    title: t('update.installTitle'),
    message: t('update.installMessage', { latest: info.latest }),
    detail: artifact.name,
    buttons: [t('update.install'), t('update.cancel')],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  }
  const answer = mainWindow
    ? await dialog.showMessageBox(mainWindow, prompt)
    : await dialog.showMessageBox(prompt)
  if (answer.response !== 0) return { status: 'error', message: t('update.cancelled') }

  updateInProgress = true
  try {
    await vpn.disconnect()
    tunnelsStopped = true
    const file = await downloadUpdateArtifact(artifact)

    if (process.platform === 'win32') {
      // The installer is per-machine, so its manifest requires administrator
      // rights and CreateProcess refuses to start it (EACCES). ShellExecute
      // with the runas verb raises the UAC prompt instead. A declined prompt
      // must leave the running application in place rather than quitting it.
      const result = await runUpdateProcess(powershellPath, encodedPowerShell(
        `$ErrorActionPreference = 'Stop'; try { Start-Process -FilePath ${psQuote(file)} -Verb RunAs | Out-Null }`
        + ` catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`,
      ))
      if (result.code !== 0) {
        return { status: 'error', message: result.output || t('update.elevationDeclined') }
      }
      quitting = true
      app.quit()
      return { status: 'started' }
    }

    if (process.platform === 'darwin') {
      launchMacUpdater(file)
      quitting = true
      app.quit()
      return { status: 'started' }
    }

    const args = linuxUpdateArgs(artifact, file)
    if (!args) return { status: 'unsupported', message: 'Gerenciador de pacotes não suportado.' }
    const result = await runUpdateProcess('pkexec', args)
    if (result.code !== 0) {
      return { status: 'error', message: result.output || 'O gerenciador de pacotes recusou a atualização.' }
    }
    app.relaunch()
    quitting = true
    app.exit(0)
    return { status: 'started' }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  } finally {
    updateInProgress = false
  }
}

function buildTrayMenu(): Menu {
  const profiles = vpn.getProfiles()
  const state = vpn.getState()

  const profileItems = profiles.map((profile: VpnProfile) => {
    const session = state.sessions[profile.id]
    const mark =
      session?.status === 'connected'
        ? '●'
        : session?.status === 'connecting'
          ? '◐'
          : session?.status === 'error'
            ? '✖'
            : '○'

    return {
      label: `${mark} ${profile.name}`,
      click: () => {
        if (session && session.status !== 'disconnected') {
          void vpn.disconnect(profile.id)
        } else {
          void vpn.connect(profile.id)
        }
      },
    }
  })

  const anyUp = Object.values(state.sessions).some(
    (s) => s.status === 'connected' || s.status === 'connecting',
  )

  return Menu.buildFromTemplate([
    {
      label: t('tray.show'),
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    { type: 'separator' },
    ...profileItems,
    { type: 'separator' },
    {
      label: t('tray.disconnectAll'),
      enabled: anyUp,
      click: () => void vpn.disconnect(),
    },
    {
      label: t('tray.refresh'),
      click: () => vpn.refreshProfiles(),
    },
    {
      label: t('tray.checkUpdates'),
      click: () => void performUpdateCheck(true),
    },
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: () => {
        app.quit()
      },
    },
  ])
}

function createTray(): void {
  const icon = iconPath()
  const image = icon
    ? nativeImage.createFromPath(icon).resize({ width: 24, height: 24 })
    : nativeImage.createEmpty()

  tray = new Tray(image)
  tray.setToolTip('My VPNs')
  tray.setContextMenu(buildTrayMenu())
  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function wireVpnEvents(): void {
  vpn.on('state', (state: VpnState) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('vpn:state', state)
    }

    const summary = summarizeVpnState(state)
    tray?.setContextMenu(buildTrayMenu())
    tray?.setToolTip(
      summary.connectedCount > 0
        ? `My VPNs — ${summary.connectedCount}`
        : summary.connectingCount > 0
          ? 'My VPNs…'
          : 'My VPNs',
    )

    const connectedNow = new Set(
      Object.values(state.sessions)
        .filter((s) => s.status === 'connected')
        .map((s) => s.profileId),
    )
    // Keep a previously healthy session in the notification set while it is
    // briefly connecting. A status transition during supervisor hand-off is
    // not evidence that the tunnel fell; only an explicit disconnected/error
    // state (or removal) should produce a Windows disconnect notification.
    const transitional = new Set(
      Object.values(state.sessions)
        .filter((s) => s.status === 'connecting')
        .map((s) => s.profileId),
    )

    for (const id of connectedNow) {
      if (!lastConnected.has(id)) {
        notify(
          t('notify.connectedTitle'),
          t('notify.connectedBody', { id }),
        )
      }
    }
    for (const id of lastConnected) {
      if (!connectedNow.has(id) && !transitional.has(id)) {
        const session = state.sessions[id]
        notify(
          t('notify.disconnectedTitle'),
          session?.message || t('notify.disconnectedBody', { id }),
        )
      }
    }
    lastConnected = new Set([
      ...connectedNow,
      ...[...lastConnected].filter((id) => transitional.has(id)),
    ])
  })

  vpn.on('log', (line: string) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('vpn:log', line)
    }
  })

  vpn.on('profiles', (profiles: VpnProfile[]) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('vpn:profiles', profiles)
    }
    tray?.setContextMenu(buildTrayMenu())
  })
}

function registerIpc(): void {
  ipcMain.handle('vpn:getProfiles', () => vpn.getProfiles())
  ipcMain.handle('vpn:refreshProfiles', () => vpn.refreshProfiles())
  ipcMain.handle('vpn:getState', () => vpn.getState())
  ipcMain.handle('vpn:connect', (_e, profileId: string) =>
    vpn.connect(profileId),
  )
  ipcMain.handle('vpn:disconnect', (_e, profileId?: string) =>
    vpn.disconnect(profileId),
  )
  ipcMain.handle('vpn:setAutoReconnect', (_e, enabled: boolean) => {
    vpn.setAutoReconnect(enabled)
  })
  ipcMain.handle('app:minimizeToTray', () => {
    mainWindow?.hide()
  })
  ipcMain.handle('deps:status', () => getDependencyStatus())
  ipcMain.handle('deps:installVpnClient', async (event) => {
    return installVpnClient((line) => {
      event.sender.send('deps:installLog', line)
    })
  })

  ipcMain.handle('settings:get', () => ({
    locale,
    autostart: isAutostartEnabled(),
    autostartPath: getAutostartPath(),
    theme: normalizeTheme(nativeTheme.themeSource),
    version: app.getVersion(),
  }))

  ipcMain.handle('settings:setLocale', (_e, next: AppLocale) => {
    locale = next === 'pt-BR' ? 'pt-BR' : 'en'
    saveSettings({ locale })
    tray?.setContextMenu(buildTrayMenu())
    return { locale }
  })

  ipcMain.handle('theme:set', (_e, next: string) => {
    const theme = normalizeTheme(next)
    nativeTheme.themeSource = theme
    saveSettings({ theme })
    return { theme }
  })

  ipcMain.handle('settings:setAutostart', (_e, enabled: boolean) => {
    const ok = setAutostartEnabled(Boolean(enabled))
    return { ok, enabled: isAutostartEnabled(), path: getAutostartPath() }
  })

  ipcMain.handle('profiles:getDraft', (_e, id: string) => readProfileDraft(id))

  ipcMain.handle(
    'profiles:save',
    async (_e, draft: VpnProfileDraft, overwrite: boolean) => {
      const result = await saveProfileDraft(draft, { overwrite })
      if (result.ok) vpn.refreshProfiles()
      return result
    },
  )

  ipcMain.handle('profiles:delete', async (_e, id: string) => {
    await vpn.disconnect(id)
    const result = await deleteProfileFile(id)
    if (result.ok) vpn.refreshProfiles()
    return result
  })

  ipcMain.handle('profiles:importDialog', async () => {
    const picked = await dialog.showOpenDialog({
      title: 'Import openfortivpn .conf',
      properties: ['openFile'],
      filters: [
        { name: 'openfortivpn conf', extensions: ['conf'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })

    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, canceled: true, message: 'Canceled' }
    }

    return draftFromImportedFile(picked.filePaths[0])
  })

  ipcMain.handle('updates:check', (): Promise<UpdateCheckResult> => {
    return performUpdateCheck(true)
  })

  ipcMain.handle('updates:dismiss', (_e, version: string) => {
    saveSettings({ dismissedUpdateVersion: String(version || '') })
    return { ok: true }
  })

  ipcMain.handle('updates:open', async (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url)
      return { ok: true }
    }
    return { ok: false }
  })

  ipcMain.handle('updates:install', (_e, info: UpdateInfo) => {
    if (!info || typeof info.latest !== 'string' || !Array.isArray(info.artifacts)) {
      return { status: 'error', message: 'Dados da atualização inválidos.' }
    }
    return installAppUpdate(info)
  })
}

app.whenReady().then(() => {
  const settings = loadSettings()
  locale = settings.locale
  nativeTheme.themeSource = normalizeTheme(settings.theme)
  registerIpc()
  wireVpnEvents()
  createWindow()
  createTray()
  scheduleNextUpdateCheck()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
})

app.on('before-quit', (event) => {
  if (!tunnelsStopped) {
    event.preventDefault()
    if (quitting) return
    quitting = true
    void vpn.disconnect().finally(() => { tunnelsStopped = true; app.quit() })
    return
  }
  quitting = true
  if (updateTimer) clearTimeout(updateTimer)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep tray alive
  }
})

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
})
