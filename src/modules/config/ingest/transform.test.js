import { parseSemver, coerceStatus, buildFormDefinition } from './transform.js'
import { FORM_DEFINITION_STATUS } from '../config.constants.js'

describe('parseSemver', () => {
  test('parses a valid semver string into numeric parts', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 })
  })

  test('parses multi-digit components', () => {
    expect(parseSemver('10.20.30')).toEqual({ major: 10, minor: 20, patch: 30 })
  })

  test('throws on a string with missing components', () => {
    expect(() => parseSemver('1.2')).toThrow('Invalid semver string: 1.2')
  })

  test('throws on a non-numeric string', () => {
    expect(() => parseSemver('v1.2.3')).toThrow('Invalid semver string: v1.2.3')
  })
})

describe('coerceStatus', () => {
  test('returns ACTIVE when the status is active', () => {
    expect(coerceStatus(FORM_DEFINITION_STATUS.ACTIVE)).toBe(FORM_DEFINITION_STATUS.ACTIVE)
  })

  test('returns DRAFT when the status is draft', () => {
    expect(coerceStatus(FORM_DEFINITION_STATUS.DRAFT)).toBe(FORM_DEFINITION_STATUS.DRAFT)
  })

  test('defaults unknown statuses to DRAFT', () => {
    expect(coerceStatus('published')).toBe(FORM_DEFINITION_STATUS.DRAFT)
  })

  test('defaults undefined status to DRAFT', () => {
    expect(coerceStatus(undefined)).toBe(FORM_DEFINITION_STATUS.DRAFT)
  })
})

describe('buildFormDefinition', () => {
  const baseParams = {
    grantCode: 'farm-payments',
    version: '1.2.3',
    status: FORM_DEFINITION_STATUS.ACTIVE,
    definition: { name: 'Farm Payments', metadata: { id: 'fd-001' }, pages: [] },
    updatedAt: '2024-01-01T00:00:00.000Z'
  }

  test('builds a document from broker metadata and definition body', () => {
    const result = buildFormDefinition(baseParams)

    expect(result).toEqual({
      grantCode: 'farm-payments',
      id: 'fd-001',
      title: 'Farm Payments',
      major: 1,
      minor: 2,
      patch: 3,
      status: FORM_DEFINITION_STATUS.ACTIVE,
      definition: baseParams.definition,
      updatedAt: new Date('2024-01-01T00:00:00.000Z')
    })
  })

  test('falls back to grantCode@version for id when metadata.id is missing', () => {
    const result = buildFormDefinition({ ...baseParams, definition: { name: 'Farm Payments' } })

    expect(result.id).toBe('farm-payments@1.2.3')
  })

  test('falls back to grantCode for title when definition name is missing', () => {
    const result = buildFormDefinition({ ...baseParams, definition: {} })

    expect(result.title).toBe('farm-payments')
  })

  test('coerces unknown statuses to DRAFT', () => {
    const result = buildFormDefinition({ ...baseParams, status: 'something-else' })

    expect(result.status).toBe(FORM_DEFINITION_STATUS.DRAFT)
  })

  test('uses the current time when updatedAt is not provided', () => {
    const before = Date.now()
    const result = buildFormDefinition({ ...baseParams, updatedAt: undefined })
    const after = Date.now()

    expect(result.updatedAt).toBeInstanceOf(Date)
    expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(result.updatedAt.getTime()).toBeLessThanOrEqual(after)
  })

  test('throws when the version is not valid semver', () => {
    expect(() => buildFormDefinition({ ...baseParams, version: 'latest' })).toThrow('Invalid semver string: latest')
  })
})
