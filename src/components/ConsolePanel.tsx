import { useEffect, useRef } from 'react'
import { Terminal } from 'lucide-react'
import { useI18n } from '../i18n/useI18n'

interface Props {
  logs: string[]
  summaryLabel: string
  anyBusy: boolean
  onClear: () => void
}

function lineClass(line: string): string | undefined {
  const lower = line.toLowerCase()
  if (lower.includes('error') || lower.includes('failed') || line.includes('✗')) {
    return 'text-[#ff8a7a]'
  }
  if (line.includes('→') || line.includes('↻')) {
    return 'text-accent'
  }
  return undefined
}

export function ConsolePanel({ logs, summaryLabel, anyBusy, onClear }: Props) {
  const { t } = useI18n()
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  return (
    <section className="flex h-44 shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-[#12161c]">
      <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2">
        <span className="inline-flex items-center gap-2 text-[11px] font-medium tracking-wide text-white/60 uppercase">
          <Terminal className="size-3.5" />
          {t('console.title', { label: summaryLabel })}
          {anyBusy ? t('console.working') : ''}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] font-medium tracking-wide text-white/50 uppercase transition-colors hover:text-accent"
        >
          {t('console.clear')}
        </button>
      </div>
      <div
        ref={logRef}
        className="console-scroll min-h-0 flex-1 overflow-y-auto px-3.5 py-2.5 font-mono text-xs leading-5 text-white/75"
      >
        {logs.length === 0 ? (
          <p className="text-white/40">{t('console.empty')}</p>
        ) : (
          logs.map((line, i) => (
            <div key={`${i}-${line.slice(0, 24)}`} className={lineClass(line)}>
              {line}
            </div>
          ))
        )}
      </div>
    </section>
  )
}
