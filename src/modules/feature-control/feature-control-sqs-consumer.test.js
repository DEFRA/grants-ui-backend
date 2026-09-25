import { createSqsConsumerPlugin } from '../../common/helpers/sqs/create-sqs-consumer-plugin.js'
import { ingestFeatureControlMessage } from './ingest-feature-control.js'
import './feature-control-sqs-consumer.js'

jest.mock('../../common/helpers/sqs/create-sqs-consumer-plugin.js', () => ({
  createSqsConsumerPlugin: jest.fn((options) => ({ name: options.name }))
}))

jest.mock('./ingest-feature-control.js', () => ({
  ingestFeatureControlMessage: jest.fn()
}))

// The plugin is built when the module is imported, so capture the wiring now.
const wiring = createSqsConsumerPlugin.mock.calls[0][0]

describe('featureControlSqsConsumerPlugin', () => {
  test('wires the shared SQS consumer to the feature-control queue and ingest handler', () => {
    expect(wiring).toEqual({
      name: 'feature-control-sqs-consumer',
      consumer: 'feature-control',
      queueUrlConfigKey: 'configIngest.featureControlSqsQueueUrl',
      queueUrlEnvVar: 'CONFIG_INGEST_FEATURE_CONTROL_SQS_QUEUE_URL',
      handleMessage: ingestFeatureControlMessage
    })
  })
})
