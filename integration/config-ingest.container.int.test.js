import { MongoClient } from 'mongodb'
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'

// These tests exercise the config-ingest event wiring end-to-end against the
// running stack (LocalStack S3/SQS + Mongo).
//
// Event path: seed a YAML object in S3 and enqueue an SNS-shaped message on the
// ingest SQS queue, then poll Mongo until the upserted definition lands. The
// backend's SQS consumer (handleMessage -> ingestVersion -> S3 -> transform ->
// upsertDefinition) is what makes the document appear. This path is fully
// self-contained: the test seeds its own S3 object and enqueues its own message,
// so there is no dependency on broker warm-up timing.
//
// A negative case asserts that a message whose manifest has no matching entry is
// not silently upserted (handleMessage throws, the message is left for redelivery).
//
// NOTE: the broker startup-pull path is intentionally NOT asserted here. It is
// covered by the startup-pull unit tests; asserting it from integration coupled
// test correctness to the config broker's cold-start timing and was chronically
// flaky in CI.

const CONFIG_DB = 'grants-ui-backend'
const CONFIG_COLLECTION = 'config__form_definitions'
const BUCKET = 'configs-bucket'
const QUEUE_NAME = 'grants_ui_backend__sqs__config_updates'
const REGION = 'eu-west-2'

const INGEST_GRANT_CODE = 'int-test-ingest-grant'
const NEGATIVE_GRANT_CODE = 'int-test-negative-grant'

let db
let client
let awsEndpoint
let queueUrl

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// PUT an object into the LocalStack S3 bucket using path-style addressing.
const putS3Object = async (key, body) => {
  const res = await fetch(`${awsEndpoint}/${BUCKET}/${encodeURI(key)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/x-yaml' },
    body
  })
  if (!res.ok) {
    throw new Error(`S3 PutObject failed: ${res.status} ${await res.text()}`)
  }
}

// SendMessage via the SQS query protocol (form-encoded).
const sendSqsMessage = async (messageBody) => {
  // The queue is identified by the request path, so we POST straight to the
  // queue URL and omit the QueueUrl body param.
  const form = new URLSearchParams({
    Action: 'SendMessage',
    Version: '2012-11-05',
    MessageBody: messageBody
  })
  const res = await fetch(queueUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      // LocalStack derives the region (and thus the queue lookup) from the
      // credential scope; the signature itself is not verified.
      authorization: `AWS4-HMAC-SHA256 Credential=test/20200101/${REGION}/sqs/aws4_request, SignedHeaders=host, Signature=int-test`
    },
    body: form.toString()
  })
  if (!res.ok) {
    throw new Error(`SQS SendMessage failed: ${res.status} ${await res.text()}`)
  }
}

// SQS messages delivered from an SNS subscription (non-raw delivery) arrive as an
// SNS "Notification" envelope. We build that envelope directly so the consumer's
// parseSnsMessage SNS branch is exercised exactly as in production.
const buildSnsEnvelope = ({ grantCode, version, status, manifest }) =>
  JSON.stringify({
    Type: 'Notification',
    MessageId: `int-test-${Date.now()}`,
    TopicArn: `arn:aws:sns:${REGION}:000000000000:gfr__sns___config_update`,
    Message: JSON.stringify(manifest),
    MessageAttributes: {
      grant: { Type: 'String', Value: grantCode },
      version: { Type: 'String', Value: version },
      status: { Type: 'String', Value: status },
      path: { Type: 'String', Value: BUCKET }
    }
  })

// Polls Mongo until a matching definition appears or the timeout elapses.
const waitForDefinition = async (query, { timeoutMs = 30_000, intervalMs = 500 } = {}) => {
  const deadline = Date.now() + timeoutMs
  let doc = await db.collection(CONFIG_COLLECTION).findOne(query)
  while (!doc && Date.now() < deadline) {
    await sleep(intervalMs)
    doc = await db.collection(CONFIG_COLLECTION).findOne(query)
  }
  return doc
}

beforeAll(async () => {
  client = await MongoClient.connect(process.env.MONGO_URI)
  db = client.db(CONFIG_DB)

  awsEndpoint = process.env.AWS_ENDPOINT_URL
  // LocalStack queue URLs follow the {endpoint}/{accountId}/{queueName} format.
  queueUrl = `${awsEndpoint}/000000000000/${QUEUE_NAME}`
})

afterAll(async () => {
  // Only remove the documents this suite created; never wipe the collection, as
  // it also holds the definition pulled from the broker during server startup.
  await db.collection(CONFIG_COLLECTION).deleteMany({
    grantCode: { $in: [INGEST_GRANT_CODE, NEGATIVE_GRANT_CODE] }
  })
  await client.close()
})

describe('config ingest: SNS -> SQS -> S3 -> Mongo', () => {
  it('upserts a definition when a config-update message is received', async () => {
    const version = '2.3.4'
    const key = `${INGEST_GRANT_CODE}/${version}/grants-ui/${INGEST_GRANT_CODE}.yaml`
    const definitionYaml = ['name: Integration Test Grant', 'metadata:', '  id: int-test-ingest-id'].join('\n')

    await db.collection(CONFIG_COLLECTION).deleteMany({ grantCode: INGEST_GRANT_CODE })

    await putS3Object(key, definitionYaml)

    await sendSqsMessage(
      buildSnsEnvelope({
        grantCode: INGEST_GRANT_CODE,
        version,
        status: 'active',
        manifest: [key]
      })
    )

    const doc = await waitForDefinition({ grantCode: INGEST_GRANT_CODE })

    expect(doc).not.toBeNull()
    expect(doc).toMatchObject({
      grantCode: INGEST_GRANT_CODE,
      id: 'int-test-ingest-id',
      title: 'Integration Test Grant',
      major: 2,
      minor: 3,
      patch: 4,
      status: 'active'
    })
    expect(doc.definition).toMatchObject({ name: 'Integration Test Grant' })
  }, 60_000)

  it('does not upsert when the manifest has no matching entry', async () => {
    await db.collection(CONFIG_COLLECTION).deleteMany({ grantCode: NEGATIVE_GRANT_CODE })

    // Manifest references a different grant's file, so ingestVersion throws and
    // the consumer leaves the message on the queue instead of upserting.
    await sendSqsMessage(
      buildSnsEnvelope({
        grantCode: NEGATIVE_GRANT_CODE,
        version: '1.0.0',
        status: 'active',
        manifest: ['some-other-grant/1.0.0/some-other-grant.yaml']
      })
    )

    // Give the consumer enough time to have polled and failed at least once.
    await sleep(8_000)

    const doc = await db.collection(CONFIG_COLLECTION).findOne({ grantCode: NEGATIVE_GRANT_CODE })
    expect(doc).toBeNull()
  }, 30_000)
})
