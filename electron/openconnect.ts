import { createHash, X509Certificate } from 'node:crypto'
import { isIP } from 'node:net'
import tls from 'node:tls'

export interface OpenConnectPlan {
  args: string[]
  password: string
  host: string
  port: number
  trustedCerts: string[]
  setDns: boolean
  setRoutes: boolean
  persistent: number
}

export function confEntries(raw: string): [string, string][] {
  return raw.split(/\r?\n/).flatMap(line => {
    const text = line.trim()
    if (!text || /^[#;]/.test(text)) return []
    const eq = text.indexOf('=')
    if (eq < 1) throw new Error('Invalid .conf line (expected key = value).')
    return [[text.slice(0, eq).trim().toLowerCase(), text.slice(eq + 1).trim()]] as [string, string][]
  })
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (/^(1|true|yes|on)$/i.test(value)) return true
  if (/^(0|false|no|off)$/i.test(value)) return false
  throw new Error('Invalid boolean in VPN configuration.')
}

// OpenConnect's own --config syntax is NOT openfortivpn syntax. Translate only
// understood options, never silently drop an imported option or pass it to a shell.
export function buildOpenConnectPlan(raw: string): OpenConnectPlan {
  const entries = confEntries(raw)
  const supported = new Set(['host', 'port', 'username', 'user', 'password', 'trusted-cert',
    'set-dns', 'set-routes', 'realm', 'persistent', 'ca-file', 'user-cert', 'user-key', 'otp'])
  const unknown = [...new Set(entries.filter(([key]) => !supported.has(key)).map(([key]) => key))]
  if (unknown.length) throw new Error(`Unsupported .conf options on Windows: ${unknown.join(', ')}. The original profile has been preserved.`)
  const values = new Map(entries)
  const host = values.get('host') || ''
  if (!host || /[\s/\\?#@]/.test(host) || host.includes('\0') || host.startsWith('-')) throw new Error('Invalid VPN host.')
  const port = Number(values.get('port') || 443)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid VPN port.')
  const persistent = Number(values.get('persistent') || 0)
  if (!Number.isInteger(persistent) || persistent < 0) throw new Error('Invalid persistent interval.')
  const args = ['--protocol=fortinet', '--passwd-on-stdin', '--disable-ipv6']
  if (!values.get('otp')) args.push('--non-inter')
  const user = values.get('username') ?? values.get('user')
  if (user) args.push(`--user=${user}`)
  if (values.get('realm')) args.push(`--usergroup=${encodeURIComponent(values.get('realm')!)}`)
  for (const [key, option] of [['ca-file', 'cafile'], ['user-cert', 'certificate'], ['user-key', 'sslkey']]) {
    if (values.get(key)) args.push(`--${option}=${values.get(key)}`)
  }
  // Retry cadence is managed by My VPNs, preserving openfortivpn's interval
  // semantics rather than confusing them with OpenConnect's retry time budget.
  args.push('--reconnect-timeout=1')
  args.push(`https://${isIP(host) === 6 ? `[${host}]` : host}:${port}`)
  const trustedCerts = entries.filter(([k]) => k === 'trusted-cert').map(([, value]) => value.replace(/:/g, '').toLowerCase())
  if (trustedCerts.some(pin => !/^[a-f0-9]{64}$/.test(pin))) throw new Error('trusted-cert must be a complete SHA256 certificate fingerprint (64 hex characters).')
  const password = values.get('password') || ''
  const otp = values.get('otp')
  return { args, password: password + '\n' + (otp ? otp + '\n' : ''), host, port, trustedCerts,
    persistent, setDns: bool(values.get('set-dns'), true), setRoutes: bool(values.get('set-routes'), true) }
}

export function certificatePublicKeyPin(rawCertificate: Buffer, trustedCerts: string[]): string {
  const digest = createHash('sha256').update(rawCertificate).digest('hex')
  if (!trustedCerts.includes(digest)) throw new Error('VPN certificate does not match trusted-cert. Connection refused.')
  const cert = new X509Certificate(rawCertificate)
  const publicKey = cert.publicKey.export({ type: 'spki', format: 'der' })
  return 'pin-sha256:' + createHash('sha256').update(publicKey).digest('base64')
}

export function resolveServerPin(plan: OpenConnectPlan): Promise<string | null> {
  if (!plan.trustedCerts.length) return Promise.resolve(null) // Use normal CA + hostname verification.
  return new Promise((resolve, reject) => {
    // No credentials are sent on this probe. An explicit full certificate
    // fingerprint is checked before deriving the OpenConnect public-key pin.
    const socket = tls.connect({ host: plan.host, port: plan.port,
      servername: isIP(plan.host) ? undefined : plan.host, rejectUnauthorized: false })
    socket.setTimeout(10000, () => socket.destroy(new Error('VPN certificate probe timed out.')))
    socket.once('error', reject)
    socket.once('secureConnect', () => {
      try { resolve(certificatePublicKeyPin(socket.getPeerCertificate().raw, plan.trustedCerts)) }
      catch (err) { reject(err) }
      finally { socket.destroy() }
    })
  })
}
