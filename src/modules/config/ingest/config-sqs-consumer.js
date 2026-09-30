import { createSqsConsumerPlugin } from '../../../common/helpers/sqs/create-sqs-consumer-plugin.js'
import { ingestVersion } from './ingest.js'
import { ingestAllowlist } from '../../allowlist/ingest-allowlist.js'
import { parseSnsMessage } from './sns-message.js'
import { FORM_DEFINITION_STATUS } from '../config.constants.js'

/**
 * @typedef {import('../../../common/helpers/sqs/create-sqs-consumer-plugin.js').SqsMessage} SqsMessage
 */

/**
 * Processes one config-update SQS message: parses the SNS envelope and ingests
 * the version (and the allowlist, for active versions).
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
 * Hapi plugin that polls the config-update SQS queue and ingests broker config updates.
 */
export const configSqsConsumerPlugin = createSqsConsumerPlugin({
  name: 'config-sqs-consumer',
  consumer: 'config',
  queueUrlConfigKey: 'configIngest.sqsQueueUrl',
  queueUrlEnvVar: 'CONFIG_INGEST_SQS_QUEUE_URL',
  handleMessage
})
