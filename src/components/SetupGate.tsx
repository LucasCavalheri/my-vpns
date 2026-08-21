import { useEffect, useRef, useState } from 'react'
import { CircleAlert, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import type { DependencyStatus, InstallResult } from '../types'
import { useI18n } from '../i18n/useI18n'

interface Props {
  status: DependencyStatus
  onInstalled: (next: DependencyStatus) => void
}

export function SetupGate({ status, onInstalled }: Props) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const off = window.myVpns.onInstallLog((line) => {
      setLogs((prev) => [...prev.slice(-200), line])
    })
    return off
  }, [])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  async function install() {
    setBusy(true)
    setError(null)
    setLogs([])
    try {
      const result: InstallResult = await window.myVpns.installOpenfortivpn()
      if (result.ok) {
        onInstalled(result.status)
      } else {
        setError(result.output || t('setup.installFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function recheck() {
    setBusy(true)
    setError(null)
    try {
      const next = await window.myVpns.getDependencyStatus()
      if (next.openfortivpnInstalled) {
        onInstalled(next)
      } else {
        setError(t('setup.stillMissing'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-6 text-ink">
      <div className="fade-up w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-xl shadow-black/5">
        <div className="flex items-center gap-3.5 border-b border-line px-6 py-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <CircleAlert className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">
              {t('setup.missing')}
            </p>
            <h1 className="text-xl font-bold tracking-tight">openfortivpn</h1>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <p className="text-sm leading-relaxed text-muted">
            {t('setup.needsClient')}{' '}
            <strong className="font-semibold text-ink">
              {status.distro.pretty}
            </strong>
            .
          </p>

          <div className="rounded-lg border border-line bg-app px-4 py-3 font-mono text-sm">
            <div className="text-[10px] font-semibold tracking-widest text-muted uppercase">
              {t('setup.installPlan', { family: status.distro.family })}
            </div>
            <div className="mt-2 break-all">
              {status.installCommand
                ? `pkexec ${status.installCommand}`
                : t('setup.noAutoInstall')}
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-fault/25 bg-fault-soft px-3 py-2 font-mono text-xs break-all text-fault">
              {error}
            </p>
          )}

          {logs.length > 0 && (
            <div
              ref={logRef}
              className="console-scroll max-h-36 overflow-y-auto rounded-lg border border-line bg-[#12161c] px-3 py-2 font-mono text-xs leading-5 text-white/75"
            >
              {logs.map((line, i) => (
                <div key={`${i}-${line.slice(0, 20)}`}>{line}</div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              type="button"
              disabled={busy || !status.canAutoInstall}
              onClick={() => void install()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              {busy ? t('setup.working') : t('setup.installNow')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void recheck()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw className="size-4" />
              {t('setup.recheck')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
