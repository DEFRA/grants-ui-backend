import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs'
import { config } from '../../../config.js'
import { ingestVersion } from './ingest.js'
import { ingestAllowlist } from '../../allowlist/ingest-allowlist.js'
import { parseSnsMessage } from './sns-message.js'
import { FORM_DEFINITION_STATUS } from '../config.constants.js'
import { log, LogCodes } from '../../../common/helpers/logging/log.js'

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
 * Processes one SQS message: parses the SNS envelope, ingests the version,
 * and deletes the message on success.
 *
 * Throws on processing errors so the caller can leave the message visible
 * for redelivery.
 *
 * @param {SqsMessage} message
 */
export async function handleMessage(message) {
  const { attributes, manifest } = parseSnsMessage(message.Body, message.MessageAttributes)

  const grantCode = attributes.grant
  const version = attributes.version
  const status = attributes.status
  const bucket = attributes.path

  if (!grantCode || !version || !bucket) {
    throw new Error(`SNS message missing required attributes (grant, version, path): got ${JSON.stringify(attributes)}`)
  }

  await ingestVersion({
    grantCode,
    version,
    status,
    bucket,
    manifest
  })

  if (status === FORM_DEFINITION_STATUS.ACTIVE) {
    await ingestAllowlist({ grantCode, version, bucket, manifest })
  }
}

/**
 * Hapi plugin that polls an SQS queue and ingests broker config updates.
 *
 * Lifecycle:
 *   - `register` only wires the plugin; no I/O yet.
 *   - on `server.events.on('start', ...)` it kicks off the long-poll loop.
 *   - on `server.ext('onPreStop', ...)` it signals the loop to stop and
 *     awaits the current iteration before returning.
 */
export const sqsConsumerPlugin = {
  name: 'config-sqs-consumer',
  register(server) {
    const queueUrl = config.get('configIngest.sqsQueueUrl')
    const waitTimeSeconds = config.get('configIngest.sqsWaitTimeSeconds')
    const maxMessages = config.get('configIngest.sqsMaxMessages')
    const visibilityTimeout = config.get('configIngest.sqsVisibilityTimeoutSeconds')

    let running = false
    let loopPromise

    async function pollOnce() {
      const client = getSqsClient()
      const response = await client.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: maxMessages,
          WaitTimeSeconds: waitTimeSeconds,
          VisibilityTimeout: visibilityTimeout,
          MessageAttributeNames: ['All'],
          AttributeNames: ['All']
        })
      )

      const messages = response.Messages ?? []
      for (const message of messages) {
        try {
          await handleMessage(message)
          await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }))
        } catch (err) {
          log(LogCodes.CONFIG.SQS_MESSAGE_FAILED, {
            errorName: err.name,
            errorMessage: err.message,
            stack: err.stack
          })
        }
      }
    }

    async function loop() {
      // running is modified outside the loop in the onPreStop handler
      // eslint-disable-next-line no-unmodified-loop-condition
      while (running) {
        try {
          await pollOnce()
        } catch (err) {
          log(LogCodes.CONFIG.SQS_POLL_FAILED, {
            errorName: err.name,
            errorMessage: err.message,
            stack: err.stack
          })
          await new Promise((resolve) => setTimeout(resolve, POLL_RETRY_DELAY_MS))
        }
      }
    }

    server.events.on('start', () => {
      if (!queueUrl) {
        log(LogCodes.CONFIG.SQS_QUEUE_URL_MISSING, {})
        return
      }
      running = true
      log(LogCodes.CONFIG.SQS_CONSUMER_START, { queueUrl })
      loopPromise = loop()
    })

    server.ext('onPreStop', async () => {
      running = false
      log(LogCodes.CONFIG.SQS_CONSUMER_STOP, {})
      try {
        await loopPromise
      } catch (err) {
        log(LogCodes.CONFIG.SQS_CONSUMER_SHUTDOWN_ERROR, {
          errorName: err.name,
          errorMessage: err.message,
          stack: err.stack
        })
      }
    })
  }
}
