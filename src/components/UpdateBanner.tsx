import { ArrowUpRight, Download, X } from 'lucide-react'
import type { UpdateInfo } from '../types'
import { useI18n } from '../i18n/I18nProvider'

interface Props {
  update: UpdateInfo
  onOpen: (url: string) => void
  onDismiss: () => void
}

export function UpdateBanner({ update, onOpen, onDismiss }: Props) {
  const { t } = useI18n()
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
            {t('update.aptHint')}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onOpen(update.url)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          {t('update.open')}
          <ArrowUpRight className="size-3.5" />
        </button>
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
