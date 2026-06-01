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
  let envelope
  try {
    envelope = JSON.parse(body)
  } catch (err) {
    throw new Error(`SQS message body is not valid JSON: ${err.message}`)
  }

  // Default SNS delivery: SNS envelope inside SQS body
  if (envelope && typeof envelope === 'object' && envelope.Type === 'Notification') {
    const attributes = {}
    const rawAttrs = envelope.MessageAttributes ?? {}
    for (const [key, value] of Object.entries(rawAttrs)) {
      attributes[key] = value?.Value ?? value?.StringValue ?? ''
    }

    let manifest
    try {
      manifest = JSON.parse(envelope.Message)
    } catch {
      manifest = envelope.Message
    }

    return { attributes, manifest }
  }

  // Raw message delivery: body is the payload, attributes from SQS itself
  const attributes = {}
  for (const [key, value] of Object.entries(sqsAttributes ?? {})) {
    attributes[key] = value?.StringValue ?? value?.stringValue ?? ''
  }
  return { attributes, manifest: envelope }
}
