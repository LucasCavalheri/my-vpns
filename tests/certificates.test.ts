import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { createHash, X509Certificate } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildOpenConnectPlan, certificatePublicKeyPin, resolveServerPin } from '../electron/openconnect'

// Public test-only localhost key/certificate. Never use these in production.
const cert = fs.readFileSync(path.join(import.meta.dirname, 'fixtures/localhost-cert.pem'))
const key = fs.readFileSync(path.join(import.meta.dirname, 'fixtures/localhost-key.pem'))
const raw = new X509Certificate(cert).raw
const digest = createHash('sha256').update(raw).digest('hex')

describe('certificate compatibility', () => {
  it('checks the exact openfortivpn leaf certificate before deriving an OpenConnect SPKI pin', () => {
    const pin = certificatePublicKeyPin(raw, [digest])
    expect(pin).toMatch(/^pin-sha256:[A-Za-z0-9+/]+=*$/)
    expect(pin).not.toContain(digest)
    expect(() => certificatePublicKeyPin(raw, ['0'.repeat(64)])).toThrow('does not match')
  })

  it('probes a real TLS peer, sends no HTTP credentials, and refuses a different fingerprint', async () => {
    let requests = 0
    const server = https.createServer({ key, cert }, (_req, res) => { requests++; res.end('unexpected') })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const port = (server.address() as { port: number }).port
      const plan = buildOpenConnectPlan(`host=127.0.0.1\nport=${port}\npassword=secret\ntrusted-cert=${digest}`)
      await expect(resolveServerPin(plan)).resolves.toBe(certificatePublicKeyPin(raw, [digest]))
      await expect(resolveServerPin({ ...plan, trustedCerts: ['0'.repeat(64)] })).rejects.toThrow('does not match')
      expect(requests).toBe(0)
    } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
  })
})
