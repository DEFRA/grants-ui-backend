/**
 * Parses an SQS message body that was delivered from an SNS subscription
 * (with default — non-raw — delivery) into the broker's logical message:
 * `{ attributes, manifest }`.
 *
 * The SNS envelope looks like:
 *   {
 *     "Type": "Notification",
 *     "MessageAttributes": { "grant": { "Type": "String", "Value": "..." }, ... },
 *     "Message": "<json-encoded manifest payload>"
 *   }
 *
 * When raw message delivery is enabled the SQS body is just the manifest JSON
 * and the attributes live on the SQS message itself; we handle that case via
 * the `sqsAttributes` fallback parameter.
 *
 * @param {string} body - raw SQS message body
 * @param {Record<string, { StringValue?: string, stringValue?: string }>} [sqsAttributes]
 * @returns {{ attributes: Record<string, string>, manifest: string[] }}
 */
export function parseSnsMessage(body, sqsAttributes) {
  const envelope = parseJsonBody(body)

  // Default SNS delivery: SNS envelope inside SQS body
  if (isSnsNotification(envelope)) {
    return parseSnsEnvelope(envelope)
  }

  // Raw message delivery: body is the payload, attributes from SQS itself
  return { attributes: extractSqsAttributes(sqsAttributes), manifest: envelope }
}

/**
 * Parses a JSON string, throwing a descriptive error if parsing fails.
 *
 * @param {string} body - raw JSON string
 * @returns {unknown}
 */
function parseJsonBody(body) {
  try {
    return JSON.parse(body)
  } catch (err) {
    throw new Error(`SQS message body is not valid JSON: ${err.message}`)
  }
}

/**
 * Returns true if the parsed envelope looks like an SNS Notification object.
 *
 * @param {unknown} envelope
 * @returns {boolean}
 */
function isSnsNotification(envelope) {
  return envelope && typeof envelope === 'object' && envelope.Type === 'Notification'
}

/**
 * Extracts the manifest and normalised attributes from an SNS envelope.
 *
 * @param {{ Message: string, MessageAttributes?: Record<string, unknown> }} envelope
 * @returns {{ attributes: Record<string, string>, manifest: unknown }}
 */
function parseSnsEnvelope(envelope) {
  let manifest
  try {
    manifest = JSON.parse(envelope.Message)
  } catch {
    manifest = envelope.Message
  }
  return { attributes: extractSnsAttributes(envelope.MessageAttributes), manifest }
}

/**
 * Normalises SNS MessageAttributes into a flat `{ key: value }` map.
 *
 * @param {Record<string, { Value?: string, StringValue?: string }> | undefined} messageAttributes
 * @returns {Record<string, string>}
 */
function extractSnsAttributes(messageAttributes) {
  const attributes = {}
  for (const [key, value] of Object.entries(messageAttributes ?? {})) {
    attributes[key] = value?.Value ?? value?.StringValue ?? ''
  }
  return attributes
}

/**
 * Normalises SQS MessageAttributes into a flat `{ key: value }` map.
 *
 * @param {Record<string, { StringValue?: string, stringValue?: string }> | undefined} sqsAttributes
 * @returns {Record<string, string>}
 */
function extractSqsAttributes(sqsAttributes) {
  const attributes = {}
  for (const [key, value] of Object.entries(sqsAttributes ?? {})) {
    attributes[key] = value?.StringValue ?? value?.stringValue ?? ''
  }
  return attributes
}
