import { ingestVersion } from './ingest.js'
import { upsertDefinition } from '../config.repository.js'
import { getYamlObject } from './s3-client.js'
import { FORM_DEFINITION_STATUS } from '../config.constants.js'
import { log, LogCodes } from '../../../common/helpers/logging/log.js'

jest.mock('../config.repository.js', () => ({
  upsertDefinition: jest.fn()
}))

jest.mock('./s3-client.js', () => ({
  getYamlObject: jest.fn()
}))

jest.mock('../../../common/helpers/logging/log.js', () => {
  const actual = jest.requireActual('../../../common/helpers/logging/log.js')
  return { ...actual, log: jest.fn() }
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('ingestVersion', () => {
  const baseParams = () => ({
    grantCode: 'farm-payments',
    version: '1.2.3',
    bucket: 'my-bucket',
    status: FORM_DEFINITION_STATUS.ACTIVE,
    manifest: ['some/prefix/farm-payments.yaml', 'some/prefix/extra.yaml'],
    updatedAt: '2024-01-01T00:00:00.000Z'
  })

  test('fetches the primary yaml, transforms it, and upserts the definition', async () => {
    getYamlObject.mockResolvedValue({ name: 'Farm Payments', metadata: { id: 'fd-001' } })

    await ingestVersion(baseParams())

    expect(getYamlObject).toHaveBeenCalledWith('my-bucket', 'some/prefix/farm-payments.yaml')
    expect(upsertDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        grantCode: 'farm-payments',
        id: 'fd-001',
        title: 'Farm Payments',
        major: 1,
        minor: 2,
        patch: 3,
        status: FORM_DEFINITION_STATUS.ACTIVE
      })
    )
  })

  test('logs after upserting via the structured log helper', async () => {
    getYamlObject.mockResolvedValue({ name: 'Farm Payments' })

    await ingestVersion(baseParams())

    expect(log).toHaveBeenCalledWith(
      LogCodes.CONFIG.INGEST_UPSERTED,
      expect.objectContaining({
        grantCode: 'farm-payments',
        version: '1.2.3',
        grantDefinitionPath: 'some/prefix/farm-payments.yaml'
      })
    )
  })

  test.each([
    ['grantCode', { grantCode: undefined }],
    ['version', { version: undefined }],
    ['bucket', { bucket: undefined }]
  ])('throws when %s is missing', async (_field, overrides) => {
    await expect(ingestVersion({ ...baseParams(), ...overrides })).rejects.toThrow(
      'ingestVersion requires grantCode, version and bucket'
    )
    expect(upsertDefinition).not.toHaveBeenCalled()
  })

  test('throws when the manifest is not an array', async () => {
    await expect(ingestVersion({ ...baseParams(), manifest: 'farm-payments.yaml' })).rejects.toThrow(
      'No manifest provided for farm-payments@1.2.3'
    )
  })

  test('throws when the manifest is empty', async () => {
    await expect(ingestVersion({ ...baseParams(), manifest: [] })).rejects.toThrow(
      'No manifest provided for farm-payments@1.2.3'
    )
  })

  test('throws when the manifest has no entry matching the grant yaml', async () => {
    await expect(ingestVersion({ ...baseParams(), manifest: ['other.yaml'] })).rejects.toThrow(
      'Manifest for farm-payments@1.2.3 contains no entry matching farm-payments.yaml'
    )
    expect(getYamlObject).not.toHaveBeenCalled()
  })
})
