import type { VpnStatus } from '../types'
import { useI18n } from '../i18n/useI18n'

const pillStyles: Record<VpnStatus, string> = {
  connected: 'border-live/30 bg-live-soft text-live',
  connecting: 'border-hold/30 bg-hold-soft text-hold',
  error: 'border-fault/30 bg-fault-soft text-fault',
  disconnected: 'border-line bg-surface text-muted',
}

export function StatusPill({ status }: { status: VpnStatus }) {
  const { t } = useI18n()
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${pillStyles[status]}`}
    >
      <span
        className={`size-1.5 rounded-full bg-current ${
          status === 'connected' ? 'blink-live' : ''
        }`}
      />
      {t(`status.${status === 'connected' ? 'linkUp' : status === 'connecting' ? 'handshake' : status === 'error' ? 'fault' : 'idle'}`)}
    </span>
  )
}
