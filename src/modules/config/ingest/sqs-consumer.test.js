import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs'
import { config } from '../../../config.js'
import { ingestVersion } from './ingest.js'
import { ingestAllowlist } from '../../allowlist/ingest-allowlist.js'
import { parseSnsMessage } from './sns-message.js'
import { handleMessage, sqsConsumerPlugin } from './sqs-consumer.js'
import { log, LogCodes } from '../../../common/helpers/logging/log.js'

jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn(),
  ReceiveMessageCommand: jest.fn((input) => ({ type: 'receive', input })),
  DeleteMessageCommand: jest.fn((input) => ({ type: 'delete', input }))
}))

jest.mock('../../../config.js', () => ({
  config: {
    get: jest.fn()
  }
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

jest.mock('../../../common/helpers/logging/log.js', () => ({
  log: jest.fn(),
  LogCodes: jest.requireActual('../../../common/helpers/logging/log-codes.js').LogCodes
}))

const configValues = {
  'aws.region': 'eu-west-2',
  'aws.endpointUrl': undefined,
  'configIngest.sqsQueueUrl': 'http://localhost:4566/queue/config',
  'configIngest.sqsWaitTimeSeconds': 20,
  'configIngest.sqsMaxMessages': 10,
  'configIngest.sqsVisibilityTimeoutSeconds': 30
}

const send = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  config.get.mockImplementation((key) => configValues[key])
  SQSClient.mockImplementation(() => ({ send }))
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

describe('sqsConsumerPlugin', () => {
  const buildServer = () => {
    const handlers = {}
    return {
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
      events: { on: jest.fn((event, fn) => (handlers[`event:${event}`] = fn)) },
      ext: jest.fn((event, fn) => (handlers[event] = fn)),
      handlers
    }
  }

  test('does not start the loop and warns when queueUrl is not configured', () => {
    config.get.mockImplementation((key) => (key === 'configIngest.sqsQueueUrl' ? '' : configValues[key]))
    const server = buildServer()

    sqsConsumerPlugin.register(server)
    server.handlers['event:start']()

    expect(log).toHaveBeenCalledWith(LogCodes.CONFIG.SQS_QUEUE_URL_MISSING, {})
    expect(send).not.toHaveBeenCalled()
  })

  test('register only wires the lifecycle handlers without polling', () => {
    const server = buildServer()

    sqsConsumerPlugin.register(server)

    expect(server.events.on).toHaveBeenCalledWith('start', expect.any(Function))
    expect(server.ext).toHaveBeenCalledWith('onPreStop', expect.any(Function))
    expect(send).not.toHaveBeenCalled()
  })

  test('processes and deletes a message during a poll cycle, then stops cleanly', async () => {
    const server = buildServer()
    parseSnsMessage.mockReturnValue({
      attributes: { grant: 'farm-payments', version: '1.0.0', status: 'active', path: 'my-bucket' },
      manifest: ['farm-payments.yaml']
    })
    send.mockResolvedValueOnce({ Messages: [{ Body: 'body', ReceiptHandle: 'rh-1' }] }).mockResolvedValue({})

    sqsConsumerPlugin.register(server)
    server.handlers['event:start']()
    await server.handlers.onPreStop()

    expect(ReceiveMessageCommand).toHaveBeenCalledWith(
      expect.objectContaining({ QueueUrl: 'http://localhost:4566/queue/config', MaxNumberOfMessages: 10 })
    )
    expect(ingestVersion).toHaveBeenCalled()
    expect(DeleteMessageCommand).toHaveBeenCalledWith({
      QueueUrl: 'http://localhost:4566/queue/config',
      ReceiptHandle: 'rh-1'
    })
  })

  test('leaves a message for redelivery and logs when handling fails', async () => {
    const server = buildServer()
    parseSnsMessage.mockReturnValue({ attributes: {}, manifest: [] })
    send.mockResolvedValueOnce({ Messages: [{ Body: 'body', ReceiptHandle: 'rh-1' }] }).mockResolvedValue({})

    sqsConsumerPlugin.register(server)
    server.handlers['event:start']()
    await server.handlers.onPreStop()

    expect(log).toHaveBeenCalledWith(LogCodes.CONFIG.SQS_MESSAGE_FAILED, expect.any(Object))
    expect(DeleteMessageCommand).not.toHaveBeenCalled()
  })

  test('handles an empty receive response without processing messages', async () => {
    const server = buildServer()
    send.mockResolvedValue({})

    sqsConsumerPlugin.register(server)
    server.handlers['event:start']()
    await server.handlers.onPreStop()

    expect(ingestVersion).not.toHaveBeenCalled()
    expect(DeleteMessageCommand).not.toHaveBeenCalled()
  })
})
