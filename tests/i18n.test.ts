import { describe, expect, it } from 'vitest'
import { catalogKeys, translate } from '../src/i18n/messages'

describe('i18n catalogs', () => {
  it('keeps en and pt-BR keys in sync', () => {
    const en = catalogKeys('en').sort()
    const pt = catalogKeys('pt-BR').sort()
    expect(pt).toEqual(en)
  })

  it('interpolates variables', () => {
    expect(
      translate('en', 'ops.deskSummary', { up: 2, handshake: 1 }),
    ).toBe('2 up · 1 handshake')
    expect(
      translate('pt-BR', 'ops.deskSummary', { up: 2, handshake: 1 }),
    ).toBe('2 ativas · 1 handshake')
  })
})
