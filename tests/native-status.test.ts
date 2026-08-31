import { describe, expect, it } from 'vitest'
import { preventsReconnect, validatedNativeStatus } from '../electron/nativeVpn'
import { interpretVpnLogLine } from '../electron/vpn'
import { buildOpenConnectPlan, confEntries } from '../electron/openconnect'
import { emptyDraft, parseVpnDraft, serializeVpnDraft } from '../electron/profiles'

describe('native tunnel health and authentication policy', () => {
  it('never accepts a stale connected report or a malformed status', () => {
    expect(validatedNativeStatus(JSON.stringify({ phase: 'connected', time: 1000 }), 2000).phase).toBe('connected')
    expect(validatedNativeStatus(JSON.stringify({ phase: 'connected', time: 1000 }), 17000).phase).toBe('disconnected')
    expect(validatedNativeStatus(JSON.stringify({ phase: 'connected', time: 99999 }), 2000).phase).toBe('disconnected')
    expect(() => validatedNativeStatus('{')).toThrow()
    expect(() => validatedNativeStatus('{"phase":"connected"}')).toThrow()
    expect(interpretVpnLogLine('MYVPNS_TUNNEL_DOWN: adapter absent')).toBe('disconnected')
    expect(interpretVpnLogLine('MYVPNS_NETWORK_READY')).toBeNull()
  })

  it.each(['Cookie was rejected by server; exiting.', 'Server reports that reconnect-after-drop is not allowed.', 'Invalid credentials', 'VPN certificate does not match trusted-cert.'])('does not repeat a forbidden or failed authentication: %s', line => {
    expect(preventsReconnect(line, true)).toBe(true)
  })

  it('distinguishes an unknown CA with an already verified pin from a failed pin', () => {
    const warning = 'Server certificate verify failed: signer not found'
    expect(preventsReconnect(warning, true)).toBe(false)
    expect(preventsReconnect(warning, false)).toBe(true)
    expect(preventsReconnect('Server certificate mismatch', true)).toBe(true)
  })

  it('preserves an optional service check as openfortivpn-compatible comments through editing', () => {
    const raw = serializeVpnDraft(emptyDraft({ host: 'vpn.example.test', healthHost: '198.18.0.2', healthPort: 30015 }))
    const edited = serializeVpnDraft({ ...parseVpnDraft(raw, 'test.conf')!, username: 'alice' })
    expect(buildOpenConnectPlan(edited)).toMatchObject({ healthHost: '198.18.0.2', healthPort: 30015 })
    expect(confEntries(edited).some(([key]) => key.startsWith('my-vpns'))).toBe(false)
    expect(buildOpenConnectPlan(edited).args).toContain('--force-dpd=10')
    expect(() => buildOpenConnectPlan('host=vpn.example\n# my-vpns-health-host=198.18.0.2')).toThrow()
    expect(() => serializeVpnDraft(emptyDraft({ host: 'vpn.example', healthHost: '198.18.0.2\npassword=other', healthPort: 80 }))).toThrow()
  })
})
