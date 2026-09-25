import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs'
import { config } from '../../../config.js'
import { log, LogCodes } from '../logging/log.js'

/**
 * @typedef {Object} SqsMessage
 * @property {string} Body
 * @property {string} ReceiptHandle
 * @property {Record<string, { StringValue?: string }>} [MessageAttributes]
 */

const POLL_RETRY_DELAY_MS = 5_000

let sqsClient

function getSqsClient() {
  if (sqsClient) {
    return sqsClient
  }
  const endpointUrl = config.get('aws.endpointUrl')
  sqsClient = new SQSClient({
    region: config.get('aws.region'),
    ...(endpointUrl ? { endpoint: endpointUrl } : {})
  })
  return sqsClient
}

/**
 * @param {string} consumer
 * @param {Error} err
 */
function errorDetails(consumer, err) {
  return { consumer, errorName: err.name, errorMessage: err.message, stack: err.stack }
}

/**
 * Handles one received message and deletes it on success. A failure is logged
 * and the message is left on the queue for redelivery.
 */
async function handleReceivedMessage({ client, queueUrl, consumer, handleMessage, message }) {
  try {
    await handleMessage(message)
    await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }))
  } catch (err) {
    log(LogCodes.SQS.MESSAGE_FAILED, errorDetails(consumer, err))
  }
}

/**
 * Long-polls the queue once and handles every message received.
 */
async function pollOnce({ queueUrl, receiveOptions, consumer, handleMessage }) {
  const client = getSqsClient()
  const response = await client.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      ...receiveOptions,
      MessageAttributeNames: ['All'],
      AttributeNames: ['All']
    })
  )

  for (const message of response.Messages ?? []) {
    await handleReceivedMessage({ client, queueUrl, consumer, handleMessage, message })
  }
}

/**
 * Creates a start/stop controller around the poll loop. `stop` lets the current
 * iteration finish before resolving.
 */
function createPollLoop(pollOptions) {
  let running = false
  let loopPromise

  async function loop() {
    // running is modified outside the loop by stop()
    // eslint-disable-next-line no-unmodified-loop-condition
    while (running) {
      try {
        await pollOnce(pollOptions)
      } catch (err) {
        log(LogCodes.SQS.POLL_FAILED, errorDetails(pollOptions.consumer, err))
        await new Promise((resolve) => setTimeout(resolve, POLL_RETRY_DELAY_MS))
      }
    }
  }

  return {
    start() {
      running = true
      loopPromise = loop()
    },
    async stop() {
      running = false
      await loopPromise
    }
  }
}

/**
 * Builds a Hapi plugin that long-polls one SQS queue and hands each message to
 * `handleMessage`.
 * @param {Object} options
 * @param {string} options.name - unique Hapi plugin name
 * @param {string} options.consumer - short label used in log output, e.g. `config`
 * @param {string} options.queueUrlConfigKey - config key holding the queue URL
 * @param {string} options.queueUrlEnvVar - env var behind that key, for the "not set" warning
 * @param {(message: SqsMessage) => Promise<unknown>} options.handleMessage
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
export function createSqsConsumerPlugin({ name, consumer, queueUrlConfigKey, queueUrlEnvVar, handleMessage }) {
  return {
    name,
    register(server) {
      const queueUrl = config.get(queueUrlConfigKey)
      const pollLoop = createPollLoop({
        queueUrl,
        consumer,
        handleMessage,
        receiveOptions: {
          MaxNumberOfMessages: config.get('configIngest.sqsMaxMessages'),
          WaitTimeSeconds: config.get('configIngest.sqsWaitTimeSeconds'),
          VisibilityTimeout: config.get('configIngest.sqsVisibilityTimeoutSeconds')
        }
      })

      server.events.on('start', () => {
        if (!queueUrl) {
          log(LogCodes.SQS.QUEUE_URL_MISSING, { consumer, envVar: queueUrlEnvVar })
          return
        }
        log(LogCodes.SQS.CONSUMER_START, { consumer, queueUrl })
        pollLoop.start()
      })

      server.ext('onPreStop', async () => {
        log(LogCodes.SQS.CONSUMER_STOP, { consumer })
        try {
          await pollLoop.stop()
        } catch (err) {
          log(LogCodes.SQS.CONSUMER_SHUTDOWN_ERROR, errorDetails(consumer, err))
        }
      })
    }
  }
}
