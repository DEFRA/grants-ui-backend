import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { ingestAllowlist } from './ingest-allowlist.js'
import { replaceAllowlistEntries } from './allowlist.repository.js'
import { _resetS3ClientForTests } from '../../common/helpers/s3.js'
import { log } from '../../common/helpers/logging/log.js'

jest.mock('./allowlist.repository.js', () => ({
  replaceAllowlistEntries: jest.fn()
}))

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  GetObjectCommand: jest.fn((input) => ({ input }))
}))

jest.mock('../../config.js', () => ({
  config: { get: jest.fn((key) => (key === 'cdpEnvironment' ? 'dev' : null)) }
}))

jest.mock('../../common/helpers/logging/log.js', () => ({
  log: jest.fn(),
  LogCodes: {
    ALLOWLIST: {
      INGEST_FILE_MISSING: 'INGEST_FILE_MISSING',
      INGEST_UPSERTED: 'INGEST_UPSERTED',
      INGEST_EMPTY: 'INGEST_EMPTY'
    }
  }
}))

const send = jest.fn()

function mockYamlBody(body) {
  send.mockResolvedValue({ Body: { transformToString: jest.fn().mockResolvedValue(body) } })
}

beforeEach(() => {
  jest.clearAllMocks()
  _resetS3ClientForTests()
  S3Client.mockImplementation(() => ({ send }))
})

describe('ingestAllowlist', () => {
  const baseParams = {
    grantCode: 'woodland',
    version: '1.0.0',
    bucket: 'my-bucket',
    manifest: ['woodland/1.0.0/grants-ui/woodland.yaml', 'woodland/1.0.0/grants-ui/allowlist.yaml']
  }

  test('fetches the current env block from allowlist.yaml and ingests it', async () => {
    mockYamlBody('dev:\n  crns: ["111"]\n  sbis: ["222"]\nprod:\n  crns: ["999"]')

    await ingestAllowlist(baseParams)

    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: 'my-bucket',
      Key: 'woodland/1.0.0/grants-ui/allowlist.yaml'
    })
    expect(replaceAllowlistEntries).toHaveBeenCalledWith('woodland', [
      { grantCode: 'woodland', type: 'sbi', value: '222', updatedAt: expect.any(Date) }
    ])
  })

  test('ingests sbis successfully when allowlist.yaml has allowAll: false and no crns list', async () => {
    mockYamlBody('dev:\n  allowAll: false\n  sbis: ["222", "333"]')

    await ingestAllowlist(baseParams)

    expect(replaceAllowlistEntries).toHaveBeenCalledWith('woodland', [
      { grantCode: 'woodland', type: 'sbi', value: '222', updatedAt: expect.any(Date) },
      { grantCode: 'woodland', type: 'sbi', value: '333', updatedAt: expect.any(Date) }
    ])
    expect(log).not.toHaveBeenCalledWith('INGEST_EMPTY', expect.anything())
  })

  test('ignores crns in allowlist.yaml and ingests sbis only', async () => {
    mockYamlBody('dev:\n  crns: ["111", "333"]\n  sbis: ["222"]')

    await ingestAllowlist(baseParams)

    expect(replaceAllowlistEntries).toHaveBeenCalledWith('woodland', [
      { grantCode: 'woodland', type: 'sbi', value: '222', updatedAt: expect.any(Date) }
    ])
  })

  test('preserves entries when allowlist.yaml is not in manifest', async () => {
    await ingestAllowlist({
      ...baseParams,
      manifest: ['woodland/1.0.0/grants-ui/woodland.yaml']
    })

    expect(send).not.toHaveBeenCalled()
    expect(replaceAllowlistEntries).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('INGEST_FILE_MISSING', { grantCode: 'woodland', version: '1.0.0' })
  })

  test('preserves entries when manifest is empty', async () => {
    await ingestAllowlist({ ...baseParams, manifest: [] })

    expect(send).not.toHaveBeenCalled()
    expect(replaceAllowlistEntries).not.toHaveBeenCalled()
  })

  test.each([
    ['blank', ''],
    ['whitespace-only', '  \n'],
    ['comments-only', '# Allowlist managed outside config\n'],
    ['null', 'null'],
    ['an empty object', '{}'],
    ['missing the current environment', 'prod:\n  crns: ["111"]'],
    ['an empty environment block', 'dev: {}'],
    ['empty CRN/SBI arrays', 'dev:\n  crns: []\n  sbis: []'],
    ['crns only (crns are ignored)', 'dev:\n  crns: ["111"]'],
    ['allowAll false without entries', 'dev:\n  allowAll: false']
  ])('warns and preserves entries when allowlist.yaml is %s', async (_description, yaml) => {
    mockYamlBody(yaml)

    await ingestAllowlist(baseParams)

    expect(log).toHaveBeenCalledWith('INGEST_EMPTY', { grantCode: 'woodland', version: '1.0.0' })
    expect(replaceAllowlistEntries).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalledWith('INGEST_UPSERTED', expect.anything())
  })

  test('still replaces entries when allowAll is true', async () => {
    mockYamlBody('dev:\n  allowAll: true')

    await ingestAllowlist(baseParams)

    expect(replaceAllowlistEntries).toHaveBeenCalledWith('woodland', [
      { grantCode: 'woodland', type: 'allowAll', value: 'true', updatedAt: expect.any(Date) }
    ])
  })

  test('propagates S3 errors without changing existing entries', async () => {
    const error = new Error('NoSuchKey')
    send.mockRejectedValueOnce(error)

    await expect(ingestAllowlist(baseParams)).rejects.toThrow(error)

    expect(replaceAllowlistEntries).not.toHaveBeenCalled()
  })

  test.each([
    ['malformed YAML', 'dev: ['],
    ['multiple YAML documents', 'dev: {}\n---\ndev: {}']
  ])('rejects %s without changing existing entries', async (_description, yaml) => {
    mockYamlBody(yaml)

    await expect(ingestAllowlist(baseParams)).rejects.toThrow()

    expect(replaceAllowlistEntries).not.toHaveBeenCalled()
  })
})
