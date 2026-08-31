import { ArrowUpRight, Download, LoaderCircle, X } from 'lucide-react'
import { useState } from 'react'
import type { UpdateInfo } from '../types'
import { useI18n } from '../i18n/useI18n'

interface Props {
  update: UpdateInfo
  onOpen: (url: string) => void
  onInstall: () => Promise<{ status: string; message?: string }>
  onDismiss: () => void
}

export function UpdateBanner({ update, onOpen, onInstall, onDismiss }: Props) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasArtifacts = (update.artifacts?.length ?? 0) > 0

  async function install() {
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const result = await onInstall()
      if (result.status !== 'started') setError(result.message ?? t('update.installFailed'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="slide-down mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent-soft px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-white">
          <Download className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {t('update.available', {
              latest: update.latest,
              current: update.current,
            })}
          </p>
          <p className="truncate font-mono text-[11px] text-muted">
            {error || (busy ? t('update.installing') : t('update.aptHint'))}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => (hasArtifacts ? void install() : onOpen(update.url))}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
          {hasArtifacts ? t('update.install') : t('update.open')}
          {!busy && (hasArtifacts ? <Download className="size-3.5" /> : <ArrowUpRight className="size-3.5" />)}
        </button>
        {hasArtifacts && (
          <button
            type="button"
            onClick={() => onOpen(update.url)}
            disabled={busy}
            className="hidden text-xs text-muted underline-offset-2 hover:text-ink hover:underline sm:inline"
          >
            {t('update.open')}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('update.dismiss')}
          title={t('update.dismiss')}
          className="grid size-7 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
