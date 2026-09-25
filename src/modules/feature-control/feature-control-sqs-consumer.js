import { createSqsConsumerPlugin } from '../../common/helpers/sqs/create-sqs-consumer-plugin.js'
import { ingestFeatureControlMessage } from './ingest-feature-control.js'

/**
 * Polls the FIFO queue subscribed to the broker's feature-control SNS topic and
 * stores boolean grant-scoped values.
 */
export const featureControlSqsConsumerPlugin = createSqsConsumerPlugin({
  name: 'feature-control-sqs-consumer',
  consumer: 'feature-control',
  queueUrlConfigKey: 'configIngest.featureControlSqsQueueUrl',
  queueUrlEnvVar: 'CONFIG_INGEST_FEATURE_CONTROL_SQS_QUEUE_URL',
  handleMessage: ingestFeatureControlMessage
})
