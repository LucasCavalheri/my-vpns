export type AppLocale = 'en' | 'pt-BR'

export type VpnStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

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
  sessions: Record<string, VpnSession>
  autoReconnect: boolean
}

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
}

export interface ProfileWriteResult {
  ok: boolean
  message: string
  profile?: VpnProfile
}

export interface AppSettingsView {
  locale: AppLocale
  autostart: boolean
  autostartPath: string
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
  onState: (cb: (state: VpnState) => void) => () => void
  onLog: (cb: (line: string) => void) => () => void
  onProfiles: (cb: (profiles: VpnProfile[]) => void) => () => void
  onInstallLog: (cb: (line: string) => void) => () => void
}

declare global {
  interface Window {
    myVpns: MyVpnsApi
  }
}

export {}
