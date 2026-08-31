import fs from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('../electron/platform', async importOriginal => {
  const actual = await importOriginal<typeof import('../electron/platform')>()
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const dir = process.platform === 'win32' ? fs.mkdtempSync(path.join(os.tmpdir(), 'my-vpns-profiles-test-')) : ''
  return { ...actual, configDirectory: () => dir || actual.configDirectory() }
})

import { CONFIG_DIR, listVpnProfiles } from '../electron/vpn'
import { deleteProfileFile, emptyDraft, parseVpnDraft, readProfileDraft, saveProfileDraft, serializeVpnDraft } from '../electron/profiles'

describe.skipIf(process.platform !== 'win32')('Windows profile files and permissions', () => {
  afterAll(() => {
    for (const name of fs.readdirSync(CONFIG_DIR)) fs.unlinkSync(path.join(CONFIG_DIR, name))
    fs.rmdirSync(CONFIG_DIR)
  })

  it('creates, lists, edits and deletes a real .conf without changing its underscore id or dropping imported fields', async () => {
    const raw = `host=vpn.example\nusername=alice\npassword=senha çã\ntrusted-cert=${'a'.repeat(64)}\ntrusted-cert=${'b'.repeat(64)}\nca-file=C:\\certs\\ca.pem\nset-dns=0\nset-routes=1`
    const draft = parseVpnDraft(raw, 'my_work.conf')!
    const saved = await saveProfileDraft(draft)
    expect(saved.ok, saved.message).toBe(true)
    expect(listVpnProfiles()).toHaveLength(1)
    expect(readProfileDraft('my_work')?.password).toBe('senha çã')
    const second = await saveProfileDraft(draft)
    expect(second.ok).toBe(false)
    const edited = await saveProfileDraft({ ...readProfileDraft('my_work')!, username: 'bob' }, { overwrite: true })
    expect(edited.ok, edited.message).toBe(true)
    const contents = fs.readFileSync(path.join(CONFIG_DIR, 'my_work.conf'), 'utf8')
    expect(contents).toContain('username = bob')
    expect(contents).toContain('ca-file = C:\\certs\\ca.pem')
    expect(contents.match(/trusted-cert = /g)).toHaveLength(2)
    expect((await deleteProfileFile('my_work')).ok).toBe(true)
    expect(listVpnProfiles()).toEqual([])
  })

  it('refuses multiline secrets before creating a profile', async () => {
    expect(() => serializeVpnDraft(emptyDraft({ id: 'bad', host: 'vpn.example', password: 'secret\nset-dns=0' }))).toThrow()
    expect(fs.existsSync(path.join(CONFIG_DIR, 'bad.conf'))).toBe(false)
  })
})
