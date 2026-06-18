import { buildAllowlistEntries } from './allowlist.transform.js'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('buildAllowlistEntries', () => {
  test('returns empty array when allowlist is null', () => {
    expect(buildAllowlistEntries('woodland', null)).toEqual([])
  })

  test('returns empty array when allowlist is undefined', () => {
    expect(buildAllowlistEntries('woodland', undefined)).toEqual([])
  })

  test('returns empty array when allowlist is empty object', () => {
    expect(buildAllowlistEntries('woodland', {})).toEqual([])
  })

  test('flattens crns and sbis into individual entry documents', () => {
    const allowlist = {
      dev: {
        crns: ['1111111111', '2222222222'],
        sbis: ['123456789']
      }
    }

    const entries = buildAllowlistEntries('woodland', allowlist)

    expect(entries).toHaveLength(3)
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ grantCode: 'woodland', env: 'dev', type: 'crn', value: '1111111111' }),
        expect.objectContaining({ grantCode: 'woodland', env: 'dev', type: 'crn', value: '2222222222' }),
        expect.objectContaining({ grantCode: 'woodland', env: 'dev', type: 'sbi', value: '123456789' })
      ])
    )
  })

  test('handles multiple environments', () => {
    const allowlist = {
      dev: { crns: ['111'], sbis: [] },
      prod: { crns: [], sbis: ['999'] }
    }

    const entries = buildAllowlistEntries('woodland', allowlist)

    expect(entries).toHaveLength(2)
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ env: 'dev', type: 'crn', value: '111' }),
        expect.objectContaining({ env: 'prod', type: 'sbi', value: '999' })
      ])
    )
  })

  test('coerces numeric values to strings', () => {
    const allowlist = { dev: { crns: [1234567890], sbis: [123456789] } }

    const entries = buildAllowlistEntries('woodland', allowlist)

    expect(entries[0].value).toBe('1234567890')
    expect(entries[1].value).toBe('123456789')
  })

  test('handles missing crns or sbis gracefully', () => {
    const allowlist = { dev: { crns: ['111'] } }

    const entries = buildAllowlistEntries('woodland', allowlist)

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ type: 'crn', value: '111' })
  })

  test('ignores crns or sbis that are not arrays', () => {
    const allowlist = { dev: { crns: '1234567890', sbis: 123456789 } }

    const entries = buildAllowlistEntries('woodland', allowlist)

    expect(entries).toEqual([])
  })

  test('handles null env value gracefully', () => {
    const allowlist = { dev: null }

    const entries = buildAllowlistEntries('woodland', allowlist)

    expect(entries).toEqual([])
  })

  test('emits a single allowAll entry when allowAll is true, ignoring crns/sbis', () => {
    const allowlist = {
      dev: { allowAll: true, crns: ['111'], sbis: ['222'] }
    }

    const entries = buildAllowlistEntries('woodland', allowlist)

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ grantCode: 'woodland', env: 'dev', type: 'allowAll', value: 'true' })
  })

  test('processes crns/sbis normally when allowAll is false', () => {
    const allowlist = {
      dev: { allowAll: false, crns: ['111'], sbis: ['222'] }
    }

    const entries = buildAllowlistEntries('woodland', allowlist)

    expect(entries).toHaveLength(2)
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'crn', value: '111' }),
        expect.objectContaining({ type: 'sbi', value: '222' })
      ])
    )
  })

  test('each entry has an updatedAt date', () => {
    const allowlist = { dev: { crns: ['111'] } }

    const entries = buildAllowlistEntries('woodland', allowlist)

    expect(entries[0].updatedAt).toBeInstanceOf(Date)
  })
})
