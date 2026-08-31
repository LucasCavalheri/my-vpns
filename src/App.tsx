import { useEffect, useMemo, useState } from 'react'
import {
  LoaderCircle,
  Minimize2,
  Monitor,
  Moon,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  Sun,
  Upload,
} from 'lucide-react'
import type {
  AppLocale,
  DependencyStatus,
  ThemePreference,
  UpdateInfo,
  VpnProfile,
  VpnProfileDraft,
  VpnSession,
  VpnState,
  VpnStatus,
} from './types'
import { SetupGate } from './components/SetupGate'
import { ProfileEditor } from './components/ProfileEditor'
import { ProfileCard } from './components/ProfileCard'
import { ConsolePanel } from './components/ConsolePanel'
import { StatusPill } from './components/StatusPill'
import { Toggle } from './components/Toggle'
import { UpdateBanner } from './components/UpdateBanner'
import { I18nProvider } from './i18n/I18nProvider'
import { useI18n } from './i18n/useI18n'

const emptyState: VpnState = {
  sessions: {},
  autoReconnect: false,
}

const themeIcons: Record<ThemePreference, typeof Monitor> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

const nextThemePref: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

function blankDraft(): VpnProfileDraft {
  return {
    id: '',
    host: '',
    port: 10443,
    username: '',
    password: '',
    trustedCert: '',
    setDns: false,
    setRoutes: true,
    realm: '',
    persistent: 0,
  }
}

type CheckFeedback = 'idle' | 'checking' | 'uptodate' | 'error'

function formatDuration(connectedAt: number | null, now: number): string {
  if (!connectedAt) return '00:00:00'
  const seconds = Math.max(0, Math.floor((now - connectedAt) / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

function summarize(state: VpnState) {
  const sessions = Object.values(state.sessions)
  const connectedCount = sessions.filter((s) => s.status === 'connected').length
  const connectingCount = sessions.filter((s) => s.status === 'connecting').length

  let overall: VpnStatus = 'disconnected'
  if (connectedCount > 0) overall = 'connected'
  else if (connectingCount > 0) overall = 'connecting'
  else if (sessions.some((s) => s.status === 'error')) overall = 'error'

  return { connectedCount, connectingCount, overall }
}

function Desk() {
  const { t, locale, setLocale } = useI18n()
  const [depsReady, setDepsReady] = useState<boolean | null>(null)
  const [deps, setDeps] = useState<DependencyStatus | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<VpnProfile[]>([])
  const [state, setState] = useState<VpnState>(emptyState)
  const [logs, setLogs] = useState<string[]>([])
  const [autostart, setAutostart] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [theme, setThemePref] = useState<ThemePreference>('system')
  const [checkFeedback, setCheckFeedback] = useState<CheckFeedback>('idle')
  const [now, setNow] = useState(() => Date.now())
  const [editor, setEditor] = useState<{
    mode: 'create' | 'edit' | 'import'
    draft: VpnProfileDraft
  } | null>(null)
  const [editorBusy, setEditorBusy] = useState(false)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    let attempts = 0

    const boot = async () => {
      const api = window.myVpns
      if (!api) {
        attempts += 1
        if (attempts >= 40) {
          if (!cancelled) {
            setDepsReady(false)
            setDeps(null)
            setBootError(t('boot.bridgeMissing'))
          }
          return
        }
        window.setTimeout(() => {
          void boot()
        }, 100)
        return
      }

      try {
        const [status, settings] = await Promise.all([
          api.getDependencyStatus(),
          api.getSettings(),
        ])
        if (cancelled) return
        setLocale(settings.locale)
        setAutostart(settings.autostart)
        setThemePref(settings.theme)
        setAppVersion(settings.version)
        setDeps(status)
        setDepsReady(status.clientInstalled)
        setBootError(null)
      } catch (err) {
        if (cancelled) return
        setBootError(err instanceof Error ? err.message : String(err))
        setDepsReady(false)
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!depsReady) return
    const api = window.myVpns
    if (!api) return

    void Promise.all([api.getProfiles(), api.getState()]).then(
      ([nextProfiles, nextState]) => {
        setProfiles(nextProfiles)
        setState(nextState)
      },
    )

    void api.checkForUpdate().then((result) => {
      if (result.status === 'available') setUpdate(result.info)
    })

    const offState = api.onState(setState)
    const offProfiles = api.onProfiles(setProfiles)
    const offLog = api.onLog((line) => {
      setLogs((prev) => [...prev.slice(-400), line])
    })
    const offUpdate = api.onUpdateAvailable((info) => setUpdate(info))

    return () => {
      offState()
      offProfiles()
      offLog()
      offUpdate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsReady])

  const summary = useMemo(() => summarize(state), [state])
  const anyUp = summary.connectedCount + summary.connectingCount > 0
  const anyBusy = summary.connectingCount > 0

  const summaryLabel =
    !anyUp
      ? t('ops.noneActive')
      : t('ops.deskSummary', {
          up: summary.connectedCount,
          handshake: summary.connectingCount,
        })

  useEffect(() => {
    if (summary.connectedCount === 0) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [summary.connectedCount])

  async function toggle(profile: VpnProfile) {
    if (!window.myVpns) return
    const session = state.sessions[profile.id]
    if (session && session.status !== 'disconnected') {
      await window.myVpns.disconnect(profile.id)
    } else {
      await window.myVpns.connect(profile.id)
    }
  }

  async function changeLocale(next: AppLocale) {
    setLocale(next)
    await window.myVpns?.setLocale(next)
  }

  async function changeTheme(pref: ThemePreference) {
    setThemePref(pref)
    await window.myVpns?.setTheme(pref)
  }

  async function toggleAutostart(enabled: boolean) {
    const result = await window.myVpns?.setAutostart(enabled)
    if (result) setAutostart(result.enabled)
  }

  async function runManualCheck() {
    if (!window.myVpns || checkFeedback === 'checking') return
    setCheckFeedback('checking')
    try {
      const result = await window.myVpns.checkForUpdate()
      if (result.status === 'available') {
        setUpdate(result.info)
        setCheckFeedback('idle')
      } else if (result.status === 'up-to-date') {
        setCheckFeedback('uptodate')
      } else {
        setCheckFeedback('error')
      }
    } catch {
      setCheckFeedback('error')
    }
  }

  function openCreate() {
    setEditorError(null)
    setEditor({ mode: 'create', draft: blankDraft() })
  }

  async function openEdit(id: string) {
    setEditorError(null)
    const draft = await window.myVpns?.getProfileDraft(id)
    if (!draft) {
      setEditorError(`Could not read ${id}.conf`)
      return
    }
    setEditor({ mode: 'edit', draft })
  }

  async function openImport() {
    setEditorError(null)
    const result = await window.myVpns?.importProfileDialog()
    if (!result || result.canceled) return
    if (!result.ok || !result.draft) {
      setEditorError(result.message)
      return
    }
    setEditor({ mode: 'import', draft: result.draft })
  }

  async function saveEditor(draft: VpnProfileDraft) {
    if (!window.myVpns || !editor) return
    setEditorBusy(true)
    setEditorError(null)
    try {
      const result = await window.myVpns.saveProfile(
        draft,
        editor.mode === 'edit',
      )
      if (!result.ok) {
        setEditorError(result.message)
        return
      }
      setEditor(null)
      const next = await window.myVpns.refreshProfiles()
      setProfiles(next)
    } finally {
      setEditorBusy(false)
    }
  }

  async function removeProfile(id: string) {
    if (!window.myVpns) return
    const ok = window.confirm(t('profiles.deleteConfirm', { id }))
    if (!ok) return
    const result = await window.myVpns.deleteProfile(id)
    if (!result.ok) {
      window.alert(result.message)
      return
    }
    setProfiles(await window.myVpns.refreshProfiles())
  }

  if (bootError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid size-12 place-items-center rounded-2xl bg-fault-soft text-fault">
          <Power className="size-6" />
        </div>
        <p className="text-xs font-semibold tracking-wide text-fault uppercase">
          {t('boot.fault')}
        </p>
        <p className="max-w-lg text-lg font-semibold tracking-tight">
          {bootError}
        </p>
        <button
          type="button"
          className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          onClick={() => window.location.reload()}
        >
          {t('boot.retry')}
        </button>
      </div>
    )
  }

  if (depsReady === null) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
        <LoaderCircle className="size-4 animate-spin" />
        {t('boot.sequence')}
      </div>
    )
  }

  if (!depsReady && deps) {
    return (
      <SetupGate
        status={deps}
        onInstalled={(next) => {
          setDeps(next)
          setDepsReady(true)
        }}
      />
    )
  }

  const ThemeIcon = themeIcons[theme]

  return (
    <div className="flex h-full flex-col text-ink">
      {update && (
        <UpdateBanner
          update={update}
          onOpen={(url) => void window.myVpns?.openUpdateUrl(url)}
          onInstall={() => window.myVpns.installUpdate(update)}
          onDismiss={() => {
            void window.myVpns?.dismissUpdate(update.latest)
            setUpdate(null)
          }}
        />
      )}

      <header className="fade-up flex items-center justify-between gap-4 px-6 pb-4 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-white shadow-md shadow-accent/25">
            <ShieldCheck className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg leading-tight font-bold tracking-tight">
              My VPNs
            </h1>
            <p className="truncate text-xs text-muted">
              {t('brand.subtitleMulti')}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden font-mono text-[11px] text-muted md:block">
            {deps?.configDir}
          </span>
          <StatusPill status={summary.overall} />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="fade-up flex flex-wrap items-center gap-x-4 gap-y-2 px-6 pb-3 [animation-delay:60ms]">
          <button type="button" onClick={openCreate} className="toolbar-btn">
            <Plus className="size-4" />
            {t('ops.newProfile')}
          </button>
          <button
            type="button"
            onClick={() => void openImport()}
            className="toolbar-btn"
          >
            <Upload className="size-4" />
            {t('ops.importConf')}
          </button>
          <button
            type="button"
            onClick={() => void window.myVpns?.refreshProfiles()}
            className="toolbar-btn"
          >
            <RefreshCw className="size-4" />
            {t('ops.reloadProfiles')}
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
            <Toggle
              checked={state.autoReconnect}
              onChange={(enabled) => {
                void window.myVpns?.setAutoReconnect(enabled)
                setState((s) => ({ ...s, autoReconnect: enabled }))
              }}
              label={t('ops.autoRelink')}
            />
            <Toggle
              checked={autostart}
              onChange={(enabled) => void toggleAutostart(enabled)}
              label={t('ops.startWithLinux')}
            />
            <button
              type="button"
              disabled={!anyUp}
              onClick={() => void window.myVpns?.disconnect()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium transition-colors hover:border-fault/40 hover:bg-fault-soft hover:text-fault disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:bg-surface disabled:hover:text-inherit"
            >
              <Power className="size-4" />
              {t('ops.killAll')}
            </button>
          </div>
        </div>

        <section className="console-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-4">
          {profiles.length === 0 ? (
            <div className="fade-up flex h-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line-strong text-center">
              <ShieldCheck className="size-8 text-muted/50" />
              <p className="mt-2 text-lg font-bold tracking-tight">
                {t('profiles.emptyTitle')}
              </p>
              <p className="max-w-sm text-sm text-muted">
                {t('profiles.emptyBody')}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {profiles.map((profile, index) => {
                const session: VpnSession | undefined =
                  state.sessions[profile.id]
                const connected = session?.status === 'connected'
                return (
                  <ProfileCard
                    key={profile.id}
                    profile={profile}
                    session={session}
                    index={index}
                    uptime={
                      connected
                        ? formatDuration(session?.connectedAt ?? null, now)
                        : null
                    }
                    onToggle={() => void toggle(profile)}
                    onEdit={() => void openEdit(profile.id)}
                    onDelete={() => void removeProfile(profile.id)}
                  />
                )
              })}
            </ul>
          )}
        </section>

        <div className="px-6 pb-4">
          <ConsolePanel
            logs={logs}
            summaryLabel={summaryLabel}
            anyBusy={anyBusy}
            onClear={() => setLogs([])}
          />
        </div>
      </main>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-6 py-2.5 text-xs text-muted">
        <span className="font-mono font-medium">My VPNs v{appVersion || '…'}</span>

        <button
          type="button"
          onClick={() => void runManualCheck()}
          className="inline-flex items-center gap-1.5 font-medium text-ink transition-colors hover:text-accent"
        >
          {checkFeedback === 'checking' ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {checkFeedback === 'checking'
            ? t('update.checking')
            : t('update.checkNow')}
        </button>

        {checkFeedback === 'uptodate' && (
          <span className="inline-flex items-center gap-1 font-medium text-live">
            {t('update.upToDate', { version: appVersion })}
          </span>
        )}
        {checkFeedback === 'error' && (
          <span className="font-medium text-fault">{t('update.checkFailed')}</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-line">
            {(['pt-BR', 'en'] as const).map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => void changeLocale(loc)}
                className={`px-2 py-1 text-[11px] font-semibold tracking-wide uppercase transition-colors ${
                  locale === loc
                    ? 'bg-ink text-app'
                    : 'bg-surface text-muted hover:text-ink'
                }`}
              >
                {loc === 'pt-BR' ? 'PT' : 'EN'}
              </button>
            ))}
          </div>

          <button
            type="button"
            title={t(`theme.${theme}`)}
            aria-label={t(`theme.${theme}`)}
            onClick={() => void changeTheme(nextThemePref[theme])}
            className="grid size-7 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:text-ink"
          >
            <ThemeIcon className="size-3.5" />
          </button>

          <button
            type="button"
            title={t('ops.parkTray')}
            aria-label={t('ops.parkTray')}
            onClick={() => void window.myVpns?.minimizeToTray()}
            className="grid size-7 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:text-ink"
          >
            <Minimize2 className="size-3.5" />
          </button>
        </div>
      </footer>

      {editor && (
        <ProfileEditor
          mode={editor.mode}
          initial={editor.draft}
          busy={editorBusy}
          error={editorError}
          onClose={() => {
            setEditor(null)
            setEditorError(null)
          }}
          onSave={(draft) => void saveEditor(draft)}
        />
      )}
    </div>
  )
}

export default function App() {
  const [locale, setLocale] = useState<AppLocale>('pt-BR')

  return (
    <I18nProvider locale={locale} setLocale={setLocale}>
      <Desk />
    </I18nProvider>
  )
}
