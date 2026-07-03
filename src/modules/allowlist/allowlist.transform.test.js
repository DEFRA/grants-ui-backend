import { buildAllowlistEntries } from './allowlist.transform.js'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('buildAllowlistEntries', () => {
  test('returns empty array when envBlock is null', () => {
    expect(buildAllowlistEntries('woodland', null)).toEqual([])
  })

  test('returns empty array when envBlock is undefined', () => {
    expect(buildAllowlistEntries('woodland', undefined)).toEqual([])
  })

  test('returns empty array when envBlock is empty object', () => {
    expect(buildAllowlistEntries('woodland', {})).toEqual([])
  })

  test('flattens crns and sbis into individual entry documents', () => {
    const envBlock = {
      crns: ['1111111111', '2222222222'],
      sbis: ['123456789']
    }

    const entries = buildAllowlistEntries('woodland', envBlock)

    expect(entries).toHaveLength(3)
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ grantCode: 'woodland', type: 'crn', value: '1111111111' }),
        expect.objectContaining({ grantCode: 'woodland', type: 'crn', value: '2222222222' }),
        expect.objectContaining({ grantCode: 'woodland', type: 'sbi', value: '123456789' })
      ])
    )
  })

  test('coerces numeric values to strings', () => {
    const entries = buildAllowlistEntries('woodland', { crns: [1234567890], sbis: [123456789] })

    expect(entries[0].value).toBe('1234567890')
    expect(entries[1].value).toBe('123456789')
  })

  test('handles missing crns or sbis gracefully', () => {
    const entries = buildAllowlistEntries('woodland', { crns: ['111'] })

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ type: 'crn', value: '111' })
  })

  test('ignores crns or sbis that are not arrays', () => {
    const entries = buildAllowlistEntries('woodland', { crns: '1234567890', sbis: 123456789 })

    expect(entries).toEqual([])
  })

  test('emits a single allowAll entry when allowAll is true, ignoring crns/sbis', () => {
    const entries = buildAllowlistEntries('woodland', { allowAll: true, crns: ['111'], sbis: ['222'] })

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ grantCode: 'woodland', type: 'allowAll', value: 'true' })
  })

  test('processes crns/sbis normally when allowAll is false', () => {
    const entries = buildAllowlistEntries('woodland', { allowAll: false, crns: ['111'], sbis: ['222'] })

    expect(entries).toHaveLength(2)
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'crn', value: '111' }),
        expect.objectContaining({ type: 'sbi', value: '222' })
      ])
    )
  })

  test('each entry has an updatedAt date', () => {
    const entries = buildAllowlistEntries('woodland', { crns: ['111'] })

    expect(entries[0].updatedAt).toBeInstanceOf(Date)
  })
})
