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
  config: { get: jest.fn() }
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
  config.get.mockImplementation((key) => {
    if (key === 'cdpEnvironment') return 'dev'
    if (key === 'grantsUiBaseUrl') return 'https://grants-ui.dev.cdp-int.defra.cloud'
    return null
  })
  findGrantCodesWithAllowlist.mockResolvedValue(new Map())
})

describe('resolveAllowedGrants', () => {
  test('denies access to a grant with no allowlist entries (closed by default)', async () => {
    getAllActiveGrants.mockResolvedValue([woodland, farmPayments])
    findGrantCodesByEntry.mockResolvedValue([])

    const result = await resolveAllowedGrants('1234567890', '123456789')

    expect(result).toEqual([])
  })

  test('returns only grants where user is in both crn and sbi lists', async () => {
    getAllActiveGrants.mockResolvedValue([woodland, farmPayments])
    findGrantCodesByEntry.mockImplementation((type) => {
      if (type === 'crn') return Promise.resolve(['woodland'])
      if (type === 'sbi') return Promise.resolve(['woodland'])
    })
    findGrantCodesWithAllowlist.mockResolvedValue(
      new Map([
        ['woodland', { allowAll: false }],
        ['farm-payments', { allowAll: false }]
      ])
    )

    const result = await resolveAllowedGrants('1234567890', '123456789')

    expect(result).toHaveLength(1)
    expect(result[0].code).toBe('woodland')
  })

  test('denies access when user is in crn list but not sbi list', async () => {
    getAllActiveGrants.mockResolvedValue([woodland])
    findGrantCodesByEntry.mockImplementation((type) => {
      if (type === 'crn') return Promise.resolve(['woodland'])
      if (type === 'sbi') return Promise.resolve([])
    })
    findGrantCodesWithAllowlist.mockResolvedValue(new Map([['woodland', { allowAll: false }]]))

    const result = await resolveAllowedGrants('1234567890', '000000000')

    expect(result).toEqual([])
  })

  test('denies access when user is in sbi list but not crn list', async () => {
    getAllActiveGrants.mockResolvedValue([woodland])
    findGrantCodesByEntry.mockImplementation((type) => {
      if (type === 'crn') return Promise.resolve([])
      if (type === 'sbi') return Promise.resolve(['woodland'])
    })
    findGrantCodesWithAllowlist.mockResolvedValue(new Map([['woodland', { allowAll: false }]]))

    const result = await resolveAllowedGrants('0000000000', '123456789')

    expect(result).toEqual([])
  })

  test('denies access to all grants when none have allowlist entries', async () => {
    getAllActiveGrants.mockResolvedValue([woodland, farmPayments])
    findGrantCodesByEntry.mockResolvedValue([])

    const result = await resolveAllowedGrants('0000000000', '000000000')

    expect(result).toEqual([])
  })

  test('returns empty array when user is not on any allowlist and all grants are restricted', async () => {
    getAllActiveGrants.mockResolvedValue([woodland])
    findGrantCodesByEntry.mockResolvedValue([])
    findGrantCodesWithAllowlist.mockResolvedValue(new Map([['woodland', { allowAll: false }]]))

    const result = await resolveAllowedGrants('0000000000', '000000000')

    expect(result).toEqual([])
  })

  test('returns empty array when there are no active grants', async () => {
    getAllActiveGrants.mockResolvedValue([])
    findGrantCodesByEntry.mockResolvedValue([])

    const result = await resolveAllowedGrants('1234567890', '123456789')

    expect(result).toEqual([])
  })

  test('allows all users when allowAll is set for the grant', async () => {
    getAllActiveGrants.mockResolvedValue([woodland])
    findGrantCodesByEntry.mockResolvedValue([])
    findGrantCodesWithAllowlist.mockResolvedValue(new Map([['woodland', { allowAll: true }]]))

    const result = await resolveAllowedGrants('9999999999', '999999999')

    expect(result).toHaveLength(1)
    expect(result[0].code).toBe('woodland')
  })

  test('allowAll only applies per grant — other grants still check crn/sbi', async () => {
    getAllActiveGrants.mockResolvedValue([woodland, farmPayments])
    findGrantCodesByEntry.mockResolvedValue([])
    findGrantCodesWithAllowlist.mockResolvedValue(
      new Map([
        ['woodland', { allowAll: true }],
        ['farm-payments', { allowAll: false }]
      ])
    )

    const result = await resolveAllowedGrants('9999999999', '999999999')

    expect(result).toHaveLength(1)
    expect(result[0].code).toBe('woodland')
  })

  test('constructs url from GRANTS_UI_BASE_URL and grantCode', async () => {
    config.get.mockImplementation((key) => {
      if (key === 'cdpEnvironment') return 'prod'
      if (key === 'grantsUiBaseUrl') return 'https://grants.defra.gov.uk'
      return null
    })
    getAllActiveGrants.mockResolvedValue([woodland])
    findGrantCodesByEntry.mockImplementation((type) => {
      if (type === 'crn') return Promise.resolve(['woodland'])
      if (type === 'sbi') return Promise.resolve(['woodland'])
    })
    findGrantCodesWithAllowlist.mockResolvedValue(new Map([['woodland', { allowAll: false }]]))

    const result = await resolveAllowedGrants('1234567890', '123456789')

    expect(result[0].url).toBe('https://grants.defra.gov.uk/woodland')
  })

  test('returns null url when GRANTS_UI_BASE_URL is not set', async () => {
    config.get.mockImplementation((key) => {
      if (key === 'cdpEnvironment') return 'dev'
      if (key === 'grantsUiBaseUrl') return ''
      return null
    })
    getAllActiveGrants.mockResolvedValue([woodland])
    findGrantCodesByEntry.mockImplementation((type) => {
      if (type === 'crn') return Promise.resolve(['woodland'])
      if (type === 'sbi') return Promise.resolve(['woodland'])
    })
    findGrantCodesWithAllowlist.mockResolvedValue(new Map([['woodland', { allowAll: false }]]))

    const result = await resolveAllowedGrants('1234567890', '123456789')

    expect(result[0].url).toBeNull()
  })

  test('returns cached result on repeated call without hitting the db', async () => {
    getAllActiveGrants.mockResolvedValue([woodland])
    findGrantCodesByEntry.mockResolvedValue([])

    const first = await resolveAllowedGrants('1234567890', '123456789')
    const second = await resolveAllowedGrants('1234567890', '123456789')

    expect(second).toEqual(first)
    expect(getAllActiveGrants).toHaveBeenCalledTimes(1)
  })

  test('queries with the current cdpEnvironment', async () => {
    config.get.mockImplementation((key) => {
      if (key === 'cdpEnvironment') return 'prod'
      if (key === 'grantsUiBaseUrl') return 'https://grants.defra.gov.uk'
      return null
    })
    getAllActiveGrants.mockResolvedValue([woodland])
    findGrantCodesByEntry.mockResolvedValue([])

    await resolveAllowedGrants('1234567890', '123456789')

    expect(findGrantCodesByEntry).toHaveBeenCalledWith('crn', '1234567890', 'prod')
    expect(findGrantCodesByEntry).toHaveBeenCalledWith('sbi', '123456789', 'prod')
    expect(findGrantCodesWithAllowlist).toHaveBeenCalledWith('prod')
  })
})
