import { describe, expect, it } from 'vitest'
import { binaryCandidates, configDirectory, engineForPlatform } from '../electron/platform'
import { buildOpenConnectPlan } from '../electron/openconnect'
import { emptyDraft, parseVpnDraft, serializeVpnDraft, confPathForId } from '../electron/profiles'

describe('platform integration', () => {
  it('keeps Linux paths and selects the correct engine for each OS', () => {
    expect(configDirectory('linux')).toBe('/etc/openfortivpn')
    expect(configDirectory('darwin', '/Users/test')).toContain('Application Support')
    expect(configDirectory('win32')).toContain('My VPNs')
    expect(engineForPlatform('win32')).toBe('openconnect')
    expect(engineForPlatform('darwin')).toBe('openfortivpn')
    expect(binaryCandidates('openfortivpn', 'darwin')).toContain('/opt/homebrew/bin/openfortivpn')
  })

  it('retains extra imported options through an edit and rejects unsupported Windows options explicitly', () => {
    const imported = parseVpnDraft('host = vpn.example.com\nset-dns=0\nset-routes=1\npppd-log=/tmp/vpn.log\n', 'work.conf')!
    const raw = serializeVpnDraft({ ...imported, username: 'alice' })
    expect(raw).toContain('pppd-log = /tmp/vpn.log')
    expect(() => buildOpenConnectPlan(raw)).toThrow('pppd-log')
  })

  it('blocks profile traversal and newline option injection', () => {
    expect(() => confPathForId('../outside')).toThrow()
    expect(() => serializeVpnDraft(emptyDraft({ host: 'host\npppd-plugin = evil' }))).toThrow()
    expect(() => serializeVpnDraft(emptyDraft({ host: 'host', extraOptions: [['host', 'different']] }))).toThrow()
  })
})

describe('openfortivpn .conf to OpenConnect', () => {
  it('translates all editor fields without putting the password on the command line', () => {
    const plan = buildOpenConnectPlan(serializeVpnDraft(emptyDraft({ id: 'work', host: 'vpn.example.com', port: 10443,
      username: 'DOMAIN\\alice', password: 's e c r e t $`"', trustedCert: 'a'.repeat(64), realm: 'My Realm',
      setDns: false, setRoutes: true, persistent: 15 })))
    expect(plan.args).toContain('--protocol=fortinet')
    expect(plan.args).toContain('--user=DOMAIN\\alice')
    expect(plan.args).toContain('--usergroup=My%20Realm')
    expect(plan.args).toContain('https://vpn.example.com:10443')
    expect(plan.args.join(' ')).not.toContain('s e c r e t')
    expect(plan.password).toBe('s e c r e t $`"\n')
    expect(plan).toMatchObject({ setDns: false, setRoutes: true, persistent: 15, trustedCerts: ['a'.repeat(64)] })
  })

  it('supports a per-profile HTTPS-only mode for FortiGate gateways that reject DTLS', () => {
    const raw = 'host=vpn.example\n# my-vpns-no-dtls = 1\n'
    const plan = buildOpenConnectPlan(raw)
    expect(plan.noDtls).toBe(true)
    expect(plan.args).toContain('--no-dtls')
    const preserved = serializeVpnDraft({ ...parseVpnDraft(raw, 'tecsul.conf')!, host: 'vpn.example' })
    expect(preserved).toContain('# my-vpns-no-dtls = 1')
    expect(buildOpenConnectPlan('host=vpn.example').args).not.toContain('--no-dtls')
  })

  it('preserves the legacy openfortivpn TLS hand-off marker', () => {
    const raw = 'host=vpn.example\n# my-vpns-legacy-tunnel = 1\n'
    expect(buildOpenConnectPlan(raw).legacyTunnel).toBe(true)
    const preserved = serializeVpnDraft({ ...parseVpnDraft(raw, 'tecsul.conf')!, host: 'vpn.example' })
    expect(preserved).toContain('# my-vpns-legacy-tunnel = 1')
    expect(buildOpenConnectPlan('host=vpn.example').legacyTunnel).toBe(false)
  })

  it('retains multiple complete pins and defaults to CA validation when no pin is given', () => {
    const plan = buildOpenConnectPlan(`host=vpn.example\ntrusted-cert=${'a'.repeat(64)}\ntrusted-cert=${'b'.repeat(64)}`)
    expect(plan.trustedCerts).toHaveLength(2)
    expect(buildOpenConnectPlan('host=vpn.example').trustedCerts).toEqual([])
    expect(() => buildOpenConnectPlan('host=vpn.example\ntrusted-cert=abcd')).toThrow('complete SHA256')
  })

  it('rejects ambiguous hosts, ports, flags and executable options', () => {
    for (const text of ['host=https://vpn.example', 'host=vpn.example\nport=abc', 'host=vpn.example\nset-dns=maybe',
      'host=vpn.example\npppd-plugin=evil', 'host=vpn.example\npersistent=-1']) {
      expect(() => buildOpenConnectPlan(text)).toThrow()
    }
    expect(buildOpenConnectPlan('host=::1').args).toContain('https://[::1]:443')
  })
})
