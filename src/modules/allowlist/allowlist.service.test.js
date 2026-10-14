import { resolveAllowedGrants, allowlistCache } from './allowlist.service.js'
import { findGrantCodesByEntry, findGrantCodesWithAllowlist } from './allowlist.repository.js'
import { getAllActiveGrants } from '../config/config.repository.js'
import { config } from '../../config.js'

jest.mock('./allowlist.repository.js', () => ({
  findGrantCodesByEntry: jest.fn(),
  findGrantCodesWithAllowlist: jest.fn()
}))

jest.mock('../config/config.repository.js', () => ({
  getAllActiveGrants: jest.fn()
}))

jest.mock('../../config.js', () => ({
  config: { get: jest.fn((key) => (key === 'grantsUiBaseUrl' ? 'https://grants-ui.dev.cdp-int.defra.cloud' : null)) }
}))

jest.mock('../../common/helpers/logging/log.js', () => {
  const { LogCodes } = jest.requireActual('../../common/helpers/logging/log-codes.js')
  return { log: jest.fn(), LogCodes }
})

const woodland = { grantCode: 'woodland', title: 'Woodland Management Plan', description: 'A description.' }
const farmPayments = { grantCode: 'farm-payments', title: 'Farm Payments', description: null }

beforeEach(() => {
  jest.clearAllMocks()
  allowlistCache.clear()
  config.get.mockImplementation((key) =>
    key === 'grantsUiBaseUrl' ? 'https://grants-ui.dev.cdp-int.defra.cloud' : null
  )
  findGrantCodesWithAllowlist.mockResolvedValue(new Map())
})

describe('resolveAllowedGrants', () => {
  test('denies access to a grant with no allowlist entries (closed by default)', async () => {
    getAllActiveGrants.mockResolvedValue([woodland, farmPayments])
    findGrantCodesByEntry.mockResolvedValue([])

    const result = await resolveAllowedGrants('123456789')

    expect(result).toEqual([])
  })

  test('returns only grants where user is in the sbi list', async () => {
    getAllActiveGrants.mockResolvedValue([woodland, farmPayments])
    findGrantCodesByEntry.mockResolvedValue(['woodland'])
    findGrantCodesWithAllowlist.mockResolvedValue(
      new Map([
        ['woodland', { allowAll: false }],
        ['farm-payments', { allowAll: false }]
      ])
    )

    const result = await resolveAllowedGrants('123456789')

    expect(result).toHaveLength(1)
    expect(result[0].code).toBe('woodland')
  })

  test('denies access when user is not in the sbi list', async () => {
    getAllActiveGrants.mockResolvedValue([woodland])
    findGrantCodesByEntry.mockResolvedValue([])
    findGrantCodesWithAllowlist.mockResolvedValue(new Map([['woodland', { allowAll: false }]]))

    const result = await resolveAllowedGrants('000000000')

    expect(result).toEqual([])
  })

  test('denies access to all grants when none have allowlist entries', async () => {
    getAllActiveGrants.mockResolvedValue([woodland, farmPayments])
    findGrantCodesByEntry.mockResolvedValue([])

    const result = await resolveAllowedGrants('000000000')

    expect(result).toEqual([])
  })

  test('returns empty array when there are no active grants', async () => {
    getAllActiveGrants.mockResolvedValue([])
    findGrantCodesByEntry.mockResolvedValue([])

    const result = await resolveAllowedGrants('123456789')

    expect(result).toEqual([])
  })

  test('allows all users when allowAll is set for the grant', async () => {
    getAllActiveGrants.mockResolvedValue([woodland])
    findGrantCodesByEntry.mockResolvedValue([])
    findGrantCodesWithAllowlist.mockResolvedValue(new Map([['woodland', { allowAll: true }]]))

    const result = await resolveAllowedGrants('999999999')

    expect(result).toHaveLength(1)
    expect(result[0].code).toBe('woodland')
  })

  test('allowAll only applies per grant — other grants still check sbi', async () => {
    getAllActiveGrants.mockResolvedValue([woodland, farmPayments])
    findGrantCodesByEntry.mockResolvedValue([])
    findGrantCodesWithAllowlist.mockResolvedValue(
      new Map([
        ['woodland', { allowAll: true }],
        ['farm-payments', { allowAll: false }]
      ])
    )

    const result = await resolveAllowedGrants('999999999')

    expect(result).toHaveLength(1)
    expect(result[0].code).toBe('woodland')
  })

  test('constructs url from GRANTS_UI_BASE_URL and grantCode', async () => {
    config.get.mockImplementation((key) => (key === 'grantsUiBaseUrl' ? 'https://grants.defra.gov.uk' : null))
    getAllActiveGrants.mockResolvedValue([woodland])
    findGrantCodesByEntry.mockResolvedValue(['woodland'])
    findGrantCodesWithAllowlist.mockResolvedValue(new Map([['woodland', { allowAll: false }]]))

    const result = await resolveAllowedGrants('123456789')

    expect(result[0].url).toBe('https://grants.defra.gov.uk/woodland')
  })

  test('returns null url when GRANTS_UI_BASE_URL is not set', async () => {
    config.get.mockImplementation((key) => (key === 'grantsUiBaseUrl' ? '' : null))
    getAllActiveGrants.mockResolvedValue([woodland])
    findGrantCodesByEntry.mockResolvedValue(['woodland'])
    findGrantCodesWithAllowlist.mockResolvedValue(new Map([['woodland', { allowAll: false }]]))

    const result = await resolveAllowedGrants('123456789')

    expect(result[0].url).toBeNull()
  })

  test('returns cached result on repeated call without hitting the db', async () => {
    getAllActiveGrants.mockResolvedValue([woodland])
    findGrantCodesByEntry.mockResolvedValue([])

    const first = await resolveAllowedGrants('123456789')
    const second = await resolveAllowedGrants('123456789')

    expect(second).toEqual(first)
    expect(getAllActiveGrants).toHaveBeenCalledTimes(1)
  })

  test('queries the repository by sbi only — crn entries are never consulted', async () => {
    getAllActiveGrants.mockResolvedValue([woodland])
    findGrantCodesByEntry.mockResolvedValue([])

    await resolveAllowedGrants('123456789')

    expect(findGrantCodesByEntry).toHaveBeenCalledTimes(1)
    expect(findGrantCodesByEntry).toHaveBeenCalledWith('sbi', '123456789')
    expect(findGrantCodesWithAllowlist).toHaveBeenCalledWith()
  })

  test('coerces a numeric sbi to a string for the lookup', async () => {
    getAllActiveGrants.mockResolvedValue([woodland])
    findGrantCodesByEntry.mockResolvedValue([])

    await resolveAllowedGrants(123456789)

    expect(findGrantCodesByEntry).toHaveBeenCalledWith('sbi', '123456789')
  })
})
