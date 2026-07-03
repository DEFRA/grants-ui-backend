import { ingestAllowlist } from './ingest-allowlist.js'
import { replaceAllowlistEntries } from './allowlist.repository.js'
import { buildAllowlistEntries } from './allowlist.transform.js'
import { getYamlObject } from '../../common/helpers/s3.js'

jest.mock('./allowlist.repository.js', () => ({
  replaceAllowlistEntries: jest.fn()
}))

jest.mock('./allowlist.transform.js', () => ({
  buildAllowlistEntries: jest.fn()
}))

jest.mock('../../common/helpers/s3.js', () => ({
  getYamlObject: jest.fn()
}))

jest.mock('../../config.js', () => ({
  config: { get: jest.fn((key) => (key === 'cdpEnvironment' ? 'dev' : null)) }
}))

jest.mock('../../common/helpers/logging/log.js', () => ({
  log: jest.fn(),
  LogCodes: { ALLOWLIST: { INGEST_CLEARED: 'INGEST_CLEARED', INGEST_UPSERTED: 'INGEST_UPSERTED' } }
}))

beforeEach(() => {
  jest.clearAllMocks()
})

describe('ingestAllowlist', () => {
  const baseParams = {
    grantCode: 'woodland',
    version: '1.0.0',
    bucket: 'my-bucket',
    manifest: ['woodland/1.0.0/grants-ui/woodland.yaml', 'woodland/1.0.0/grants-ui/allowlist.yaml']
  }

  test('fetches the current env block from allowlist.yaml and ingests it', async () => {
    const yaml = { dev: { crns: ['111'], sbis: ['222'] }, prod: { crns: ['999'] } }
    const entries = [{ grantCode: 'woodland', type: 'crn', value: '111' }]

    getYamlObject.mockResolvedValue(yaml)
    buildAllowlistEntries.mockReturnValue(entries)

    await ingestAllowlist(baseParams)

    expect(getYamlObject).toHaveBeenCalledWith('my-bucket', 'woodland/1.0.0/grants-ui/allowlist.yaml')
    expect(buildAllowlistEntries).toHaveBeenCalledWith('woodland', yaml.dev)
    expect(replaceAllowlistEntries).toHaveBeenCalledWith('woodland', entries)
  })

  test('clears entries when allowlist.yaml is not in manifest', async () => {
    await ingestAllowlist({
      ...baseParams,
      manifest: ['woodland/1.0.0/grants-ui/woodland.yaml']
    })

    expect(getYamlObject).not.toHaveBeenCalled()
    expect(replaceAllowlistEntries).toHaveBeenCalledWith('woodland', [])
  })

  test('clears entries when manifest is empty', async () => {
    await ingestAllowlist({ ...baseParams, manifest: [] })

    expect(getYamlObject).not.toHaveBeenCalled()
    expect(replaceAllowlistEntries).toHaveBeenCalledWith('woodland', [])
  })
})
