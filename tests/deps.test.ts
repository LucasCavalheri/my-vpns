import { describe, expect, it } from 'vitest'
import {
  buildInstallPlan,
  detectPackageFamily,
  parseOsReleaseText,
} from '../electron/deps'

describe('parseOsReleaseText', () => {
  it('parses quoted and unquoted keys', () => {
    const map = parseOsReleaseText(`
NAME="Ubuntu"
VERSION_ID="26.04"
ID=ubuntu
ID_LIKE=debian
PRETTY_NAME="Ubuntu 26.04 LTS"
# comment
`)
    expect(map.ID).toBe('ubuntu')
    expect(map.ID_LIKE).toBe('debian')
    expect(map.PRETTY_NAME).toBe('Ubuntu 26.04 LTS')
  })
})

describe('detectPackageFamily', () => {
  const none = () => false

  it('maps ubuntu/debian to apt', () => {
    expect(detectPackageFamily('ubuntu', ['debian'], none)).toBe('apt')
    expect(detectPackageFamily('linuxmint', ['ubuntu', 'debian'], none)).toBe(
      'apt',
    )
  })

  it('maps fedora family to dnf/yum based on binaries', () => {
    expect(detectPackageFamily('fedora', [], none)).toBe('dnf')
    expect(
      detectPackageFamily('rocky', ['rhel', 'fedora'], (p) => p.includes('yum')),
    ).toBe('yum')
    expect(
      detectPackageFamily('fedora', [], (p) => p.includes('dnf5')),
    ).toBe('dnf')
  })

  it('maps suse and arch', () => {
    expect(detectPackageFamily('opensuse-tumbleweed', ['suse'], none)).toBe(
      'zypper',
    )
    expect(detectPackageFamily('arch', [], none)).toBe('pacman')
    expect(detectPackageFamily('manjaro', ['arch'], none)).toBe('pacman')
  })

  it('falls back to unknown', () => {
    expect(detectPackageFamily('weirdos', [], none)).toBe('unknown')
  })
})

describe('buildInstallPlan', () => {
  it('builds apt command', () => {
    const plan = buildInstallPlan('apt')
    expect(plan.canAutoInstall).toBe(true)
    expect(plan.installCommand).toContain('apt-get install')
    expect(plan.pkexecArgs).toContain('openfortivpn')
  })

  it('rejects unknown family', () => {
    const plan = buildInstallPlan('unknown')
    expect(plan.canAutoInstall).toBe(false)
    expect(plan.pkexecArgs).toBeNull()
  })
})
