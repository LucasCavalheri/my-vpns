import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  interpretVpnLogLine,
  listVpnProfiles,
  parseVpnConfContent,
  summarizeVpnState,
} from '../electron/vpn'

describe('parseVpnConfContent', () => {
  it('parses a typical openfortivpn profile', () => {
    const profile = parseVpnConfContent(
      `
host = vpn.example.com
port = 10443
username = alice
password = secret
trusted-cert = abcd
set-dns = 0
set-routes = 1
# comment
`,
      '/etc/openfortivpn/acme-corp.conf',
    )

    expect(profile).toMatchObject({
      id: 'acme-corp',
      name: 'Acme Corp',
      host: 'vpn.example.com',
      port: 10443,
      username: 'alice',
      setDns: false,
      setRoutes: true,
      hasPassword: true,
      hasTrustedCert: true,
    })
  })

  it('returns null without host', () => {
    expect(
      parseVpnConfContent('username = bob\n', '/tmp/broken.conf'),
    ).toBeNull()
  })

  it('accepts user as username alias and default port', () => {
    const profile = parseVpnConfContent(
      'host = a.example\nuser = bob\n',
      '/tmp/lab.conf',
    )
    expect(profile?.username).toBe('bob')
    expect(profile?.port).toBe(443)
  })
})

describe('interpretVpnLogLine', () => {
  it('detects connected markers', () => {
    expect(
      interpretVpnLogLine('INFO:   Tunnel is up and running.'),
    ).toBe('connected')
  })

  it('detects error markers', () => {
    expect(interpretVpnLogLine('ERROR:  Could not authenticate.')).toBe(
      'error',
    )
  })

  it('ignores noise', () => {
    expect(interpretVpnLogLine('INFO:   Resolving host...')).toBeNull()
  })
})

describe('listVpnProfiles', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('lists and sorts profiles from a directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'my-vpns-'))
    dirs.push(dir)

    fs.writeFileSync(
      path.join(dir, 'zeta.conf'),
      'host = z.example\nport = 443\n',
    )
    fs.writeFileSync(
      path.join(dir, 'alpha.conf'),
      'host = a.example\nport = 10443\nusername = u\n',
    )
    fs.writeFileSync(path.join(dir, 'ignore.txt'), 'nope')
    fs.writeFileSync(path.join(dir, 'bad.conf'), 'username = only\n')

    const profiles = listVpnProfiles(dir)
    expect(profiles.map((p) => p.id)).toEqual(['alpha', 'zeta'])
    expect(profiles[0].port).toBe(10443)
  })

  it('returns empty array for missing dir', () => {
    expect(listVpnProfiles('/tmp/my-vpns-does-not-exist-xyz')).toEqual([])
  })
})

describe('summarizeVpnState', () => {
  it('counts multiple concurrent sessions', () => {
    const summary = summarizeVpnState({
      autoReconnect: false,
      sessions: {
        mkraft: {
          profileId: 'mkraft',
          status: 'connected',
          message: 'up',
          connectedAt: 1,
        },
        tecsul: {
          profileId: 'tecsul',
          status: 'connecting',
          message: '…',
          connectedAt: null,
        },
      },
    })

    expect(summary.connectedCount).toBe(1)
    expect(summary.connectingCount).toBe(1)
    expect(summary.overall).toBe('connected')
  })
})
