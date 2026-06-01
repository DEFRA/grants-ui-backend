import { runStartupPull } from './startup-pull.js'
import { fetchAllGrants, fetchVersion } from './broker-client.js'
import { ingestVersion } from './ingest.js'
import { getDefinition } from '../config.repository.js'
import { FORM_DEFINITION_STATUS } from '../config.constants.js'
import { log, LogCodes } from '../../../common/helpers/logging/log.js'

jest.mock('./broker-client.js', () => ({
  fetchAllGrants: jest.fn(),
  fetchVersion: jest.fn()
}))

jest.mock('./ingest.js', () => ({
  ingestVersion: jest.fn()
}))

jest.mock('../config.repository.js', () => ({
  getDefinition: jest.fn()
}))

jest.mock('../../../common/helpers/logging/log.js', () => {
  const actual = jest.requireActual('../../../common/helpers/logging/log.js')
  return { ...actual, log: jest.fn() }
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('runStartupPull', () => {
  test('throws when the broker does not return an array', async () => {
    fetchAllGrants.mockResolvedValue({ not: 'an array' })

    await expect(runStartupPull()).rejects.toThrow('Broker /api/allGrants did not return an array')
  })

  test('returns zero counts when there are no grants', async () => {
    fetchAllGrants.mockResolvedValue([])

    const result = await runStartupPull()

    expect(result).toEqual({ total: 0, upserted: 0, failed: 0 })
  })

  test('fetches and ingests each new grant version', async () => {
    fetchAllGrants.mockResolvedValue([
      { grant: 'farm-payments', versions: [{ version: '1.0.0', status: FORM_DEFINITION_STATUS.ACTIVE }] }
    ])
    getDefinition.mockResolvedValue(null)
    fetchVersion.mockResolvedValue({
      grant: 'farm-payments',
      version: '1.0.0',
      status: FORM_DEFINITION_STATUS.ACTIVE,
      path: 'my-bucket',
      manifest: ['farm-payments.yaml'],
      lastUpdated: '2024-01-01T00:00:00.000Z'
    })

    const result = await runStartupPull()

    expect(getDefinition).toHaveBeenCalledWith('farm-payments', 1, 0, 0)
    expect(fetchVersion).toHaveBeenCalledWith('farm-payments', '1.0.0')
    expect(ingestVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        grantCode: 'farm-payments',
        version: '1.0.0',
        bucket: 'my-bucket',
        manifest: ['farm-payments.yaml'],
        updatedAt: '2024-01-01T00:00:00.000Z'
      })
    )
    expect(result).toEqual({ total: 1, upserted: 1, failed: 0 })
  })

  test('skips a version that is already ingested with the same status', async () => {
    fetchAllGrants.mockResolvedValue([
      { grant: 'farm-payments', versions: [{ version: '1.0.0', status: FORM_DEFINITION_STATUS.ACTIVE }] }
    ])
    getDefinition.mockResolvedValue({ status: FORM_DEFINITION_STATUS.ACTIVE })

    const result = await runStartupPull()

    expect(fetchVersion).not.toHaveBeenCalled()
    expect(ingestVersion).not.toHaveBeenCalled()
    expect(result).toEqual({ total: 1, upserted: 0, failed: 0 })
  })

  test('re-ingests an existing version whose status changed', async () => {
    fetchAllGrants.mockResolvedValue([
      { grant: 'farm-payments', versions: [{ version: '1.0.0', status: FORM_DEFINITION_STATUS.ACTIVE }] }
    ])
    getDefinition.mockResolvedValue({ status: FORM_DEFINITION_STATUS.DRAFT })
    fetchVersion.mockResolvedValue({
      grant: 'farm-payments',
      version: '1.0.0',
      status: FORM_DEFINITION_STATUS.ACTIVE,
      path: 'my-bucket',
      manifest: ['farm-payments.yaml']
    })

    const result = await runStartupPull()

    expect(ingestVersion).toHaveBeenCalled()
    expect(result).toEqual({ total: 1, upserted: 1, failed: 0 })
  })

  test('counts a failure and continues with remaining versions', async () => {
    fetchAllGrants.mockResolvedValue([
      {
        grant: 'farm-payments',
        versions: [
          { version: '1.0.0', status: FORM_DEFINITION_STATUS.ACTIVE },
          { version: '2.0.0', status: FORM_DEFINITION_STATUS.ACTIVE }
        ]
      }
    ])
    getDefinition.mockResolvedValue(null)
    fetchVersion.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({
      grant: 'farm-payments',
      version: '2.0.0',
      status: FORM_DEFINITION_STATUS.ACTIVE,
      path: 'my-bucket',
      manifest: ['farm-payments.yaml']
    })

    const result = await runStartupPull()

    expect(result).toEqual({ total: 2, upserted: 1, failed: 1 })
    expect(log).toHaveBeenCalledWith(
      LogCodes.CONFIG.STARTUP_PULL_VERSION_FAILED,
      expect.objectContaining({ grantCode: 'farm-payments', version: '1.0.0' })
    )
  })

  test('treats a grant with no versions array as having no versions', async () => {
    fetchAllGrants.mockResolvedValue([{ grant: 'farm-payments' }])

    const result = await runStartupPull()

    expect(result).toEqual({ total: 0, upserted: 0, failed: 0 })
  })
})
