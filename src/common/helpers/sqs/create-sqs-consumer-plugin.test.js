import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs'
import { config } from '../../../config.js'
import { createSqsConsumerPlugin } from './create-sqs-consumer-plugin.js'
import { log, LogCodes } from '../logging/log.js'

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

jest.mock('../logging/log.js', () => ({
  log: jest.fn(),
  LogCodes: jest.requireActual('../logging/log-codes.js').LogCodes
}))

const QUEUE_URL = 'http://localhost:4566/queue/test.fifo'

const configValues = {
  'aws.region': 'eu-west-2',
  'aws.endpointUrl': undefined,
  'configIngest.someQueueUrl': QUEUE_URL,
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

afterEach(() => {
  jest.useRealTimers()
})

const handleMessage = jest.fn()

function buildPlugin() {
  return createSqsConsumerPlugin({
    name: 'test-sqs-consumer',
    consumer: 'test',
    queueUrlConfigKey: 'configIngest.someQueueUrl',
    queueUrlEnvVar: 'SOME_QUEUE_URL',
    handleMessage
  })
}

function buildServer() {
  const handlers = {}
  return {
    events: { on: jest.fn((event, fn) => (handlers[`event:${event}`] = fn)) },
    ext: jest.fn((event, fn) => (handlers[event] = fn)),
    handlers
  }
}

async function runConsumerUntilStopped() {
  const server = buildServer()
  buildPlugin().register(server)
  server.handlers['event:start']()
  await server.handlers.onPreStop()
}

describe('createSqsConsumerPlugin', () => {
  test('returns a plugin with the given name', () => {
    expect(buildPlugin().name).toBe('test-sqs-consumer')
  })

  test('does not start the loop and warns when the queue URL is not configured', () => {
    config.get.mockImplementation((key) => (key === 'configIngest.someQueueUrl' ? '' : configValues[key]))
    const server = buildServer()

    buildPlugin().register(server)
    server.handlers['event:start']()

    expect(log).toHaveBeenCalledWith(LogCodes.SQS.QUEUE_URL_MISSING, { consumer: 'test', envVar: 'SOME_QUEUE_URL' })
    expect(send).not.toHaveBeenCalled()
  })

  test('logs and starts polling when the queue URL is configured', async () => {
    send.mockResolvedValue({})

    await runConsumerUntilStopped()

    expect(send).toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(LogCodes.SQS.CONSUMER_START, { consumer: 'test', queueUrl: QUEUE_URL })
    expect(log).toHaveBeenCalledWith(LogCodes.SQS.CONSUMER_STOP, { consumer: 'test' })
  })

  test('logs POLL_FAILED with the consumer label when a poll cycle throws', async () => {
    jest.useFakeTimers()
    const server = buildServer()
    send.mockRejectedValueOnce(new Error('sqs down')).mockResolvedValue({})

    buildPlugin().register(server)
    server.handlers['event:start']()
    await jest.advanceTimersByTimeAsync(0)
    const stopping = server.handlers.onPreStop()
    await jest.advanceTimersByTimeAsync(5_000)
    await stopping

    expect(log).toHaveBeenCalledWith(
      LogCodes.SQS.POLL_FAILED,
      expect.objectContaining({ consumer: 'test', errorMessage: 'sqs down' })
    )
  })

  test('register only wires the lifecycle handlers without polling', () => {
    const server = buildServer()

    buildPlugin().register(server)

    expect(server.events.on).toHaveBeenCalledWith('start', expect.any(Function))
    expect(server.ext).toHaveBeenCalledWith('onPreStop', expect.any(Function))
    expect(send).not.toHaveBeenCalled()
  })

  test('deletes a received message from the queue once handleMessage resolves', async () => {
    const message = { Body: 'body', ReceiptHandle: 'rh-1' }
    send.mockResolvedValueOnce({ Messages: [message] }).mockResolvedValue({})

    await runConsumerUntilStopped()

    expect(ReceiveMessageCommand).toHaveBeenCalledWith(
      expect.objectContaining({ QueueUrl: QUEUE_URL, MaxNumberOfMessages: 10 })
    )
    expect(handleMessage).toHaveBeenCalledWith(message)
    expect(DeleteMessageCommand).toHaveBeenCalledWith({ QueueUrl: QUEUE_URL, ReceiptHandle: 'rh-1' })
  })

  test('leaves a message for redelivery and logs when handling fails', async () => {
    handleMessage.mockRejectedValueOnce(new Error('bad message'))
    send.mockResolvedValueOnce({ Messages: [{ Body: 'body', ReceiptHandle: 'rh-1' }] }).mockResolvedValue({})

    await runConsumerUntilStopped()

    expect(log).toHaveBeenCalledWith(
      LogCodes.SQS.MESSAGE_FAILED,
      expect.objectContaining({ consumer: 'test', errorMessage: 'bad message' })
    )
    expect(DeleteMessageCommand).not.toHaveBeenCalled()
  })

  test('does not call handleMessage or delete anything when the queue returns no messages', async () => {
    send.mockResolvedValue({})

    await runConsumerUntilStopped()

    expect(handleMessage).not.toHaveBeenCalled()
    expect(DeleteMessageCommand).not.toHaveBeenCalled()
  })
})
