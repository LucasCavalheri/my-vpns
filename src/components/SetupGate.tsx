import { useEffect, useRef, useState } from 'react'
import type { DependencyStatus, InstallResult } from '../types'
import { useI18n } from '../i18n/I18nProvider'

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
      <div className="stamp-in w-full max-w-xl border-2 border-ink bg-sheet">
        <div className="border-b-2 border-ink bg-flare px-5 py-4">
          <p className="font-mono text-[11px] tracking-[0.28em] uppercase">
            {t('setup.missing')}
          </p>
          <h1 className="mt-1 text-3xl leading-none font-extrabold tracking-[-0.03em]">
            openfortivpn
          </h1>
        </div>

        <div className="space-y-4 px-5 py-5">
          <p className="text-base leading-relaxed text-mute">
            {t('setup.needsClient')}{' '}
            <strong className="text-ink">{status.distro.pretty}</strong>.
          </p>

          <div className="border-2 border-ink bg-paper px-4 py-3 font-mono text-sm">
            <div className="text-[11px] tracking-[0.18em] text-mute uppercase">
              {t('setup.installPlan', { family: status.distro.family })}
            </div>
            <div className="mt-2 break-all">
              {status.installCommand
                ? `pkexec ${status.installCommand}`
                : t('setup.noAutoInstall')}
            </div>
          </div>

          {error && (
            <p className="border-2 border-fault bg-fault/10 px-3 py-2 font-mono text-sm text-fault">
              {error}
            </p>
          )}

          {logs.length > 0 && (
            <div
              ref={logRef}
              className="console-scroll max-h-36 overflow-y-auto border-2 border-ink bg-ink px-3 py-2 font-mono text-[12px] leading-5 text-sheet/80"
            >
              {logs.map((line, i) => (
                <div key={`${i}-${line.slice(0, 20)}`}>{line}</div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              disabled={busy || !status.canAutoInstall}
              onClick={() => void install()}
              className="border-2 border-ink bg-flare px-4 py-3 font-mono text-sm tracking-[0.16em] uppercase disabled:opacity-40"
            >
              {busy ? t('setup.working') : t('setup.installNow')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void recheck()}
              className="border-2 border-ink bg-sheet px-4 py-3 font-mono text-sm tracking-[0.16em] uppercase hover:bg-paper disabled:opacity-40"
            >
              {t('setup.recheck')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
