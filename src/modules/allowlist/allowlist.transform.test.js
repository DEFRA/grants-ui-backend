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

  test('flattens sbis into individual entry documents', () => {
    const envBlock = {
      sbis: ['123456789', '987654321']
    }

    const entries = buildAllowlistEntries('woodland', envBlock)

    expect(entries).toHaveLength(2)
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ grantCode: 'woodland', type: 'sbi', value: '123456789' }),
        expect.objectContaining({ grantCode: 'woodland', type: 'sbi', value: '987654321' })
      ])
    )
  })

  test('ignores unrecognised keys in the env block and only emits sbi entries', () => {
    const envBlock = {
      other: ['1111111111', '2222222222'],
      sbis: ['123456789']
    }

    const entries = buildAllowlistEntries('woodland', envBlock)

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ grantCode: 'woodland', type: 'sbi', value: '123456789' })
  })

  test('reads sbis successfully when allowAll is false', () => {
    const entries = buildAllowlistEntries('woodland', { allowAll: false, sbis: ['123456789', '987654321'] })

    expect(entries).toHaveLength(2)
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ grantCode: 'woodland', type: 'sbi', value: '123456789' }),
        expect.objectContaining({ grantCode: 'woodland', type: 'sbi', value: '987654321' })
      ])
    )
  })

  test('coerces numeric values to strings', () => {
    const entries = buildAllowlistEntries('woodland', { sbis: [123456789] })

    expect(entries[0].value).toBe('123456789')
  })

  test('ignores sbis that are not arrays', () => {
    const entries = buildAllowlistEntries('woodland', { sbis: 123456789 })

    expect(entries).toEqual([])
  })

  test('emits a single allowAll entry when allowAll is true, ignoring sbis', () => {
    const entries = buildAllowlistEntries('woodland', { allowAll: true, sbis: ['222'] })

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ grantCode: 'woodland', type: 'allowAll', value: 'true' })
  })

  test('processes sbis normally when allowAll is false', () => {
    const entries = buildAllowlistEntries('woodland', { allowAll: false, sbis: ['222'] })

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ type: 'sbi', value: '222' })
  })

  test('each entry has an updatedAt date', () => {
    const entries = buildAllowlistEntries('woodland', { sbis: ['111'] })

    expect(entries[0].updatedAt).toBeInstanceOf(Date)
  })
})
