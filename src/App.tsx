import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AppLocale,
  DependencyStatus,
  VpnProfile,
  VpnProfileDraft,
  VpnSession,
  VpnState,
  VpnStatus,
} from './types'
import { SetupGate } from './components/SetupGate'
import { ProfileEditor } from './components/ProfileEditor'
import type { MessageKey } from './i18n/messages'
import { I18nProvider, useI18n } from './i18n/I18nProvider'

const emptyState: VpnState = {
  sessions: {},
  autoReconnect: false,
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

function statusWord(
  status: VpnStatus,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  switch (status) {
    case 'connected':
      return t('status.linkUp')
    case 'connecting':
      return t('status.handshake')
    case 'error':
      return t('status.fault')
    default:
      return t('status.idle')
  }
}

function formatDuration(connectedAt: number | null): string {
  if (!connectedAt) return '00:00:00'
  const seconds = Math.max(0, Math.floor((Date.now() - connectedAt) / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

function summarize(
  state: VpnState,
  t: ReturnType<typeof useI18n>['t'],
) {
  const sessions = Object.values(state.sessions)
  const connected = sessions.filter((s) => s.status === 'connected')
  const connecting = sessions.filter((s) => s.status === 'connecting')
  const errored = sessions.filter((s) => s.status === 'error')

  let overall: VpnStatus = 'disconnected'
  if (connected.length > 0) overall = 'connected'
  else if (connecting.length > 0) overall = 'connecting'
  else if (errored.length > 0) overall = 'error'

  const label =
    connected.length + connecting.length === 0
      ? t('ops.noneActive')
      : t('ops.deskSummary', {
          up: connected.length,
          handshake: connecting.length,
        })

  return { connected, connecting, errored, overall, label }
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
  const [now, setNow] = useState(Date.now())
  const [editor, setEditor] = useState<{
    mode: 'create' | 'edit' | 'import'
    draft: VpnProfileDraft
  } | null>(null)
  const [editorBusy, setEditorBusy] = useState(false)
  const [editorError, setEditorError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

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
        setDeps(status)
        setDepsReady(status.openfortivpnInstalled)
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

    const offState = api.onState(setState)
    const offProfiles = api.onProfiles(setProfiles)
    const offLog = api.onLog((line) => {
      setLogs((prev) => [...prev.slice(-400), line])
    })

    return () => {
      offState()
      offProfiles()
      offLog()
    }
  }, [depsReady])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  const summary = useMemo(() => summarize(state, t), [state, t])

  useEffect(() => {
    if (summary.connected.length === 0) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [summary.connected.length])

  const anyBusy = summary.connecting.length > 0

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

  async function toggleAutostart(enabled: boolean) {
    const result = await window.myVpns?.setAutostart(enabled)
    if (result) setAutostart(result.enabled)
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
        <p className="font-mono text-[11px] tracking-[0.28em] text-fault uppercase">
          {t('boot.fault')}
        </p>
        <p className="max-w-lg text-xl font-bold tracking-tight">{bootError}</p>
        <button
          type="button"
          className="mt-2 border-2 border-ink bg-flare px-4 py-2 font-mono text-sm tracking-[0.16em] uppercase"
          onClick={() => window.location.reload()}
        >
          {t('boot.retry')}
        </button>
      </div>
    )
  }

  if (depsReady === null) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-sm tracking-[0.2em] text-mute uppercase">
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

  return (
    <div className="relative flex h-full flex-col text-ink">
      <header className="stamp-in border-b-2 border-ink px-5 pb-4 pt-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] tracking-[0.28em] text-mute uppercase">
              {t('brand.subtitleMulti')}
            </p>
            <h1 className="mt-1 text-[clamp(2.6rem,7vw,4.4rem)] leading-[0.9] font-extrabold tracking-[-0.04em]">
              My VPNs
            </h1>
          </div>

          <div className="text-right">
            <div
              className={`inline-block border-2 border-ink px-3 py-2 font-mono text-sm tracking-[0.18em] ${
                summary.overall === 'connected'
                  ? 'bg-live text-sheet'
                  : summary.overall === 'error'
                    ? 'bg-fault text-sheet'
                    : summary.overall === 'connecting'
                      ? 'bg-flare text-ink'
                      : 'bg-sheet'
              }`}
            >
              <span className={summary.overall === 'connected' ? 'blink-live' : ''}>
                {statusWord(summary.overall, t)}
              </span>
            </div>
            <p className="mt-2 font-mono text-[11px] text-mute">
              /etc/openfortivpn
            </p>
          </div>
        </div>

        <div className="sweep-in mt-4 h-1.5 bg-flare" />
      </header>

      <div className="stamp-in flex flex-wrap items-center gap-x-5 gap-y-2 border-b-2 border-ink bg-sheet px-5 py-3 font-mono text-xs [animation-delay:80ms]">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-flare"
            checked={state.autoReconnect}
            onChange={(e) => {
              void window.myVpns?.setAutoReconnect(e.target.checked)
              setState((s) => ({ ...s, autoReconnect: e.target.checked }))
            }}
          />
          <span className="tracking-[0.14em] uppercase">{t('ops.autoRelink')}</span>
        </label>

        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-flare"
            checked={autostart}
            onChange={(e) => void toggleAutostart(e.target.checked)}
          />
          <span className="tracking-[0.14em] uppercase">
            {t('ops.startWithLinux')}
          </span>
        </label>

        <button
          type="button"
          onClick={openCreate}
          className="tracking-[0.14em] uppercase underline decoration-2 underline-offset-4 hover:text-flare"
        >
          {t('ops.newProfile')}
        </button>

        <button
          type="button"
          onClick={() => void openImport()}
          className="tracking-[0.14em] uppercase underline decoration-2 underline-offset-4 hover:text-flare"
        >
          {t('ops.importConf')}
        </button>

        <button
          type="button"
          onClick={() => void window.myVpns?.refreshProfiles()}
          className="tracking-[0.14em] uppercase underline decoration-2 underline-offset-4 hover:text-flare"
        >
          {t('ops.reloadProfiles')}
        </button>

        <button
          type="button"
          onClick={() => void window.myVpns?.disconnect()}
          className="tracking-[0.14em] uppercase underline decoration-2 underline-offset-4 hover:text-flare"
        >
          {t('ops.killAll')}
        </button>

        <button
          type="button"
          onClick={() => void window.myVpns?.minimizeToTray()}
          className="tracking-[0.14em] uppercase underline decoration-2 underline-offset-4 hover:text-flare"
        >
          {t('ops.parkTray')}
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-3 tracking-[0.08em] text-mute uppercase">
          <span className="flex items-center gap-1">
            {t('ops.language')}
            <button
              type="button"
              onClick={() => void changeLocale('pt-BR')}
              className={`border border-ink px-1.5 py-0.5 ${
                locale === 'pt-BR' ? 'bg-ink text-sheet' : 'bg-sheet text-ink'
              }`}
            >
              PT
            </button>
            <button
              type="button"
              onClick={() => void changeLocale('en')}
              className={`border border-ink px-1.5 py-0.5 ${
                locale === 'en' ? 'bg-ink text-sheet' : 'bg-sheet text-ink'
              }`}
            >
              EN
            </button>
          </span>
          <span>
            {t('ops.desk')} <strong className="text-ink">{summary.label}</strong>
          </span>
          <span className="sr-only">{now}</span>
        </div>
      </div>

      <main className="grid min-h-0 flex-1 grid-rows-[1fr_minmax(160px,28%)]">
        <section className="min-h-0 overflow-y-auto console-scroll">
          {profiles.length === 0 ? (
            <div className="flex h-full flex-col justify-center px-6">
              <p className="text-3xl font-bold tracking-tight">
                {t('profiles.emptyTitle')}
              </p>
              <p className="mt-2 max-w-md font-mono text-sm text-mute">
                {t('profiles.emptyBody')}
              </p>
            </div>
          ) : (
            <ul>
              {profiles.map((profile, index) => {
                const session: VpnSession | undefined = state.sessions[profile.id]
                const status = session?.status ?? 'disconnected'
                const connected = status === 'connected'
                const connecting = status === 'connecting'
                const errored = status === 'error'
                const on = connected || connecting

                return (
                  <li
                    key={profile.id}
                    className={`stamp-in border-b-2 border-ink ${
                      connected
                        ? 'bg-live/10'
                        : errored
                          ? 'bg-fault/10'
                          : 'bg-transparent hover:bg-sheet/80'
                    }`}
                    style={{ animationDelay: `${120 + index * 50}ms` }}
                  >
                    <div className="flex items-stretch gap-0">
                      <div
                        className={`w-2 shrink-0 ${
                          connected
                            ? 'bg-live'
                            : connecting
                              ? 'bg-flare'
                              : errored
                                ? 'bg-fault'
                                : 'bg-ink/15'
                        }`}
                      />

                      <div className="flex min-w-0 flex-1 flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <h2 className="text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
                              {profile.name}
                            </h2>
                            {connected && (
                              <span className="font-mono text-[11px] tracking-[0.2em] text-live uppercase">
                                {t('profiles.live', {
                                  uptime: formatDuration(
                                    session?.connectedAt ?? null,
                                  ),
                                })}
                              </span>
                            )}
                            {connecting && (
                              <span className="font-mono text-[11px] tracking-[0.2em] text-flare uppercase">
                                {t('profiles.handshake')}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 truncate font-mono text-sm text-mute">
                            {profile.host}:{profile.port}
                            <span className="mx-2 text-ink/30">//</span>
                            {profile.username || t('profiles.noUser')}
                            <span className="mx-2 text-ink/30">//</span>
                            routes {profile.setRoutes ? 'on' : 'off'} · dns{' '}
                            {profile.setDns ? 'on' : 'off'}
                          </p>
                          {session?.message && status !== 'disconnected' && (
                            <p className="mt-1 font-mono text-[11px] text-mute">
                              {session.message}
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                          <button
                            type="button"
                            disabled={connecting && !on}
                            onClick={() => void toggle(profile)}
                            className={`border-2 border-ink px-5 py-3 font-mono text-sm tracking-[0.18em] uppercase transition disabled:cursor-not-allowed disabled:opacity-40 ${
                              on
                                ? 'bg-ink text-sheet hover:bg-fault hover:border-fault'
                                : 'bg-flare text-ink hover:translate-x-0.5'
                            }`}
                          >
                            {on ? t('profiles.killLink') : t('profiles.bringUp')}
                          </button>
                          <div className="flex gap-3 font-mono text-[11px] tracking-[0.14em] uppercase">
                            <button
                              type="button"
                              onClick={() => void openEdit(profile.id)}
                              className="underline decoration-2 underline-offset-4 hover:text-flare"
                            >
                              {t('profiles.edit')}
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeProfile(profile.id)}
                              className="underline decoration-2 underline-offset-4 hover:text-fault"
                            >
                              {t('profiles.delete')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="stamp-in flex min-h-0 flex-col border-t-2 border-ink bg-ink text-sheet [animation-delay:160ms]">
          <div className="flex items-center justify-between border-b border-sheet/20 px-5 py-2 font-mono text-[11px] tracking-[0.2em] uppercase">
            <span>
              {t('console.title', { label: summary.label })}
              {anyBusy ? t('console.working') : ''}
            </span>
            <button
              type="button"
              onClick={() => setLogs([])}
              className="hover:text-flare"
            >
              {t('console.clear')}
            </button>
          </div>
          <div
            ref={logRef}
            className="console-scroll min-h-0 flex-1 overflow-y-auto px-5 py-3 font-mono text-[12.5px] leading-6 text-sheet/80"
          >
            {logs.length === 0 ? (
              <p className="text-sheet/45">{t('console.empty')}</p>
            ) : (
              logs.map((line, i) => (
                <div
                  key={`${i}-${line.slice(0, 24)}`}
                  className={
                    line.toLowerCase().includes('error') ||
                    line.toLowerCase().includes('failed') ||
                    line.includes('✗')
                      ? 'text-[#ff8a7a]'
                      : line.includes('→') || line.includes('↻')
                        ? 'text-flare'
                        : undefined
                  }
                >
                  {line}
                </div>
              ))
            )}
          </div>
        </section>
      </main>

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
