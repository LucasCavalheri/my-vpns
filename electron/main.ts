import {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  nativeImage,
  ipcMain,
  shell,
  dialog,
} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { VpnManager, summarizeVpnState, type VpnProfile, type VpnState } from './vpn'
import {
  getDependencyStatus,
  installOpenfortivpn,
} from './deps'
import {
  getAutostartPath,
  isAutostartEnabled,
  setAutostartEnabled,
} from './autostart'
import { loadSettings, saveSettings, type AppLocale } from './settings'
import { translate } from '../src/i18n/messages'
import {
  deleteProfileFile,
  draftFromImportedFile,
  readProfileDraft,
  saveProfileDraft,
  type VpnProfileDraft,
} from './profiles'
import { checkForAppUpdate, type UpdateInfo } from './updates'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Ubuntu 24+ often blocks the Electron SUID sandbox; without this the app
// exits immediately when launched from the app menu.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
}

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
const vpn = new VpnManager()
let lastConnected = new Set<string>()
let locale: AppLocale = 'en'

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
    backgroundColor: '#e3e7ec',
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
    if (!startHidden) mainWindow?.show()
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
  new Notification({ title, body, silent: false }).show()
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
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: () => {
        quitting = true
        void vpn.disconnect().finally(() => app.quit())
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

    for (const id of connectedNow) {
      if (!lastConnected.has(id)) {
        notify(
          t('notify.connectedTitle'),
          t('notify.connectedBody', { id }),
        )
      }
    }
    for (const id of lastConnected) {
      if (!connectedNow.has(id)) {
        const session = state.sessions[id]
        notify(
          t('notify.disconnectedTitle'),
          session?.message || t('notify.disconnectedBody', { id }),
        )
      }
    }
    lastConnected = connectedNow
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
  ipcMain.handle('deps:installOpenfortivpn', async (event) => {
    return installOpenfortivpn((line) => {
      event.sender.send('deps:installLog', line)
    })
  })

  ipcMain.handle('settings:get', () => ({
    locale,
    autostart: isAutostartEnabled(),
    autostartPath: getAutostartPath(),
  }))

  ipcMain.handle('settings:setLocale', (_e, next: AppLocale) => {
    locale = next === 'pt-BR' ? 'pt-BR' : 'en'
    saveSettings({ locale })
    tray?.setContextMenu(buildTrayMenu())
    return { locale }
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

  ipcMain.handle('updates:check', async (): Promise<UpdateInfo | null> => {
    try {
      const update = await checkForAppUpdate(app.getVersion())
      if (!update) return null
      const dismissed = loadSettings().dismissedUpdateVersion
      if (dismissed && dismissed === update.latest) return null
      return update
    } catch (err) {
      console.error('[my-vpns] update check failed:', err)
      return null
    }
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
}

app.whenReady().then(() => {
  locale = loadSettings().locale
  registerIpc()
  wireVpnEvents()
  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
})

app.on('before-quit', () => {
  quitting = true
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
