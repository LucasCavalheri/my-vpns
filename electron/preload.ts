import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppLocale,
  DependencyStatus,
  InstallResult,
  ProfileWriteResult,
  ThemePreference,
  UpdateCheckResult,
  UpdateInfo,
  VpnProfile,
  VpnProfileDraft,
  VpnState,
} from '../src/types'

export interface AppSettingsView {
  locale: AppLocale
  autostart: boolean
  autostartPath: string
  theme: ThemePreference
  version: string
}

export interface MyVpnsApi {
  getProfiles: () => Promise<VpnProfile[]>
  refreshProfiles: () => Promise<VpnProfile[]>
  getState: () => Promise<VpnState>
  connect: (profileId: string) => Promise<void>
  disconnect: (profileId?: string) => Promise<void>
  setAutoReconnect: (enabled: boolean) => Promise<void>
  minimizeToTray: () => Promise<void>
  getDependencyStatus: () => Promise<DependencyStatus>
  installOpenfortivpn: () => Promise<InstallResult>
  getSettings: () => Promise<AppSettingsView>
  setLocale: (locale: AppLocale) => Promise<{ locale: AppLocale }>
  setTheme: (
    theme: ThemePreference,
  ) => Promise<{ theme: ThemePreference }>
  setAutostart: (
    enabled: boolean,
  ) => Promise<{ ok: boolean; enabled: boolean; path: string }>
  getProfileDraft: (id: string) => Promise<VpnProfileDraft | null>
  saveProfile: (
    draft: VpnProfileDraft,
    overwrite?: boolean,
  ) => Promise<ProfileWriteResult>
  deleteProfile: (id: string) => Promise<ProfileWriteResult>
  importProfileDialog: () => Promise<{
    ok: boolean
    message: string
    draft?: VpnProfileDraft
    canceled?: boolean
  }>
  checkForUpdate: () => Promise<UpdateCheckResult>
  dismissUpdate: (version: string) => Promise<{ ok: boolean }>
  openUpdateUrl: (url: string) => Promise<{ ok: boolean }>
  onState: (cb: (state: VpnState) => void) => () => void
  onLog: (cb: (line: string) => void) => () => void
  onProfiles: (cb: (profiles: VpnProfile[]) => void) => () => void
  onInstallLog: (cb: (line: string) => void) => () => void
  onUpdateAvailable: (cb: (info: UpdateInfo) => void) => () => void
}

const api: MyVpnsApi = {
  getProfiles: () => ipcRenderer.invoke('vpn:getProfiles'),
  refreshProfiles: () => ipcRenderer.invoke('vpn:refreshProfiles'),
  getState: () => ipcRenderer.invoke('vpn:getState'),
  connect: (profileId) => ipcRenderer.invoke('vpn:connect', profileId),
  disconnect: (profileId) => ipcRenderer.invoke('vpn:disconnect', profileId),
  setAutoReconnect: (enabled) =>
    ipcRenderer.invoke('vpn:setAutoReconnect', enabled),
  minimizeToTray: () => ipcRenderer.invoke('app:minimizeToTray'),
  getDependencyStatus: () => ipcRenderer.invoke('deps:status'),
  installOpenfortivpn: () => ipcRenderer.invoke('deps:installOpenfortivpn'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setLocale: (locale) => ipcRenderer.invoke('settings:setLocale', locale),
  setTheme: (theme) => ipcRenderer.invoke('theme:set', theme),
  setAutostart: (enabled) =>
    ipcRenderer.invoke('settings:setAutostart', enabled),
  getProfileDraft: (id) => ipcRenderer.invoke('profiles:getDraft', id),
  saveProfile: (draft, overwrite) =>
    ipcRenderer.invoke('profiles:save', draft, overwrite ?? false),
  deleteProfile: (id) => ipcRenderer.invoke('profiles:delete', id),
  importProfileDialog: () => ipcRenderer.invoke('profiles:importDialog'),
  checkForUpdate: () => ipcRenderer.invoke('updates:check'),
  dismissUpdate: (version) => ipcRenderer.invoke('updates:dismiss', version),
  openUpdateUrl: (url) => ipcRenderer.invoke('updates:open', url),
  onState: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, state: VpnState) => cb(state)
    ipcRenderer.on('vpn:state', listener)
    return () => ipcRenderer.removeListener('vpn:state', listener)
  },
  onLog: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, line: string) => cb(line)
    ipcRenderer.on('vpn:log', listener)
    return () => ipcRenderer.removeListener('vpn:log', listener)
  },
  onProfiles: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, profiles: VpnProfile[]) =>
      cb(profiles)
    ipcRenderer.on('vpn:profiles', listener)
    return () => ipcRenderer.removeListener('vpn:profiles', listener)
  },
  onInstallLog: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, line: string) => cb(line)
    ipcRenderer.on('deps:installLog', listener)
    return () => ipcRenderer.removeListener('deps:installLog', listener)
  },
  onUpdateAvailable: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, info: UpdateInfo) =>
      cb(info)
    ipcRenderer.on('updates:updateAvailable', listener)
    return () => ipcRenderer.removeListener('updates:updateAvailable', listener)
  },
}

contextBridge.exposeInMainWorld('myVpns', api)
