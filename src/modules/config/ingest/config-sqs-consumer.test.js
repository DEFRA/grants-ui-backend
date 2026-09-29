import { createSqsConsumerPlugin } from '../../../common/helpers/sqs/create-sqs-consumer-plugin.js'
import { ingestVersion } from './ingest.js'
import { ingestAllowlist } from '../../allowlist/ingest-allowlist.js'
import { parseSnsMessage } from './sns-message.js'
import { handleMessage } from './config-sqs-consumer.js'

jest.mock('../../../common/helpers/sqs/create-sqs-consumer-plugin.js', () => ({
  createSqsConsumerPlugin: jest.fn((options) => ({ name: options.name }))
}))

jest.mock('./ingest.js', () => ({
  ingestVersion: jest.fn()
}))

jest.mock('../../allowlist/ingest-allowlist.js', () => ({
  ingestAllowlist: jest.fn()
}))

jest.mock('./sns-message.js', () => ({
  parseSnsMessage: jest.fn()
}))

// The plugin is built when the module is imported, so capture the wiring now.
const wiring = createSqsConsumerPlugin.mock.calls[0][0]

beforeEach(() => {
  jest.clearAllMocks()
})

describe('handleMessage', () => {
  test('parses the message and ingests the version', async () => {
    parseSnsMessage.mockReturnValue({
      attributes: { grant: 'farm-payments', version: '1.0.0', status: 'active', path: 'my-bucket' },
      manifest: ['farm-payments.yaml']
    })
    const message = { Body: 'body', MessageAttributes: { grant: {} } }

    await handleMessage(message)

    expect(parseSnsMessage).toHaveBeenCalledWith('body', message.MessageAttributes)
    expect(ingestVersion).toHaveBeenCalledWith({
      grantCode: 'farm-payments',
      version: '1.0.0',
      status: 'active',
      bucket: 'my-bucket',
      manifest: ['farm-payments.yaml']
    })
  })

  test('ingests allowlist when status is active', async () => {
    parseSnsMessage.mockReturnValue({
      attributes: { grant: 'farm-payments', version: '1.0.0', status: 'active', path: 'my-bucket' },
      manifest: ['farm-payments.yaml']
    })

    await handleMessage({ Body: 'body' })

    expect(ingestAllowlist).toHaveBeenCalledWith({
      grantCode: 'farm-payments',
      version: '1.0.0',
      bucket: 'my-bucket',
      manifest: ['farm-payments.yaml']
    })
  })

  test('does not ingest allowlist when status is draft', async () => {
    parseSnsMessage.mockReturnValue({
      attributes: { grant: 'farm-payments', version: '1.0.0', status: 'draft', path: 'my-bucket' },
      manifest: ['farm-payments.yaml']
    })

    await handleMessage({ Body: 'body' })

    expect(ingestAllowlist).not.toHaveBeenCalled()
  })

  test.each([
    ['grant', { grant: undefined, version: '1.0.0', path: 'my-bucket' }],
    ['version', { grant: 'farm-payments', version: undefined, path: 'my-bucket' }],
    ['path', { grant: 'farm-payments', version: '1.0.0', path: undefined }]
  ])('throws when required attribute %s is missing', async (_field, attributes) => {
    parseSnsMessage.mockReturnValue({ attributes, manifest: [] })

    await expect(handleMessage({ Body: 'body' })).rejects.toThrow(/SNS message missing required attributes/)
    expect(ingestVersion).not.toHaveBeenCalled()
  })
})

describe('configSqsConsumerPlugin', () => {
  test('wires the shared SQS consumer to the config queue and handleMessage', () => {
    expect(wiring).toEqual({
      name: 'config-sqs-consumer',
      consumer: 'config',
      queueUrlConfigKey: 'configIngest.sqsQueueUrl',
      queueUrlEnvVar: 'CONFIG_INGEST_SQS_QUEUE_URL',
      handleMessage
    })
  })
})
