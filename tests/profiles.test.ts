import { describe, expect, it } from 'vitest'
import {
  isValidProfileId,
  parseVpnDraft,
  serializeVpnDraft,
  slugifyProfileId,
} from '../electron/profiles'

describe('profile draft serialize/parse', () => {
  it('round-trips fields used in current configs', () => {
    const draft = {
      id: 'tecsul',
      host: 'br-spo1-ssl-vpn.wevy.cloud',
      port: 10443,
      username: 'alice',
      password: 'secret',
      trustedCert: 'abc123',
      setDns: false,
      setRoutes: true,
      realm: '',
      persistent: 0,
    }

    const raw = serializeVpnDraft(draft)
    expect(raw).toContain('host = br-spo1-ssl-vpn.wevy.cloud')
    expect(raw).toContain('set-dns = 0')
    expect(raw).toContain('set-routes = 1')
    expect(raw).toContain('trusted-cert = abc123')

    const parsed = parseVpnDraft(raw, 'tecsul.conf')
    expect(parsed).toMatchObject(draft)
  })

  it('slugifies and validates ids', () => {
    expect(slugifyProfileId('Acme Corp.conf')).toBe('acme-corp')
    expect(isValidProfileId('mkraft')).toBe(true)
    expect(isValidProfileId('Bad Id')).toBe(false)
  })
})
