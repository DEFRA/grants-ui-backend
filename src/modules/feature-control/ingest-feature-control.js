import { parseSnsMessage } from '../config/ingest/sns-message.js'
import { upsertFeatureControl } from './feature-control.repository.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'

const BOOLEAN_TYPE = 'boolean'
const GRANT_SCOPE_PREFIX = 'grant.'

/**
 * Parses the `scopes` message attribute. The broker publishes it as a
 * `String.Array`, which arrives as a JSON-encoded string.
 *
 * @param {string | undefined} raw
 * @returns {string[]}
 */
function parseScopes(raw) {
  if (!raw) {
    return []
  }
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new TypeError(`Feature control scopes attribute is not an array: ${raw}`)
  }
  return parsed
}

/**
 * Stores a feature control if it is one Grants UI cares about: a boolean with
 * at least one `grant.*` scope. Anything else is logged and skipped.
 *
 * @param {Object} params
 * @param {string} params.name
 * @param {string} params.valueType
 * @param {string[]} params.scopes
 * @param {unknown} params.value
 * @returns {Promise<boolean>} true when stored
 */
export async function storeFeatureControl({ name, valueType, scopes, value }) {
  if (valueType !== BOOLEAN_TYPE || !scopes.some((scope) => scope.startsWith(GRANT_SCOPE_PREFIX))) {
    log(LogCodes.FEATURE_CONTROL.INGEST_IGNORED, { name, valueType, scopes: scopes.join(',') })
    return false
  }

  if (typeof value !== 'boolean') {
    throw new TypeError(`Feature control ${name} has valueType boolean but value ${JSON.stringify(value)}`)
  }

  const normalisedName = name.toUpperCase()
  await upsertFeatureControl({ name: normalisedName, value, valueType: BOOLEAN_TYPE, scopes })
  log(LogCodes.FEATURE_CONTROL.INGEST_UPSERTED, { name: normalisedName, value })
  return true
}

/**
 * Processes one SQS message from the broker's feature-control topic.
 * Throws on malformed messages so the caller leaves them for redelivery.
 * @param {{ Body: string, MessageAttributes?: Record<string, { StringValue?: string }> }} message
 * @returns {Promise<boolean>} true when the message was stored
 */
export async function ingestFeatureControlMessage(message) {
  const { attributes, manifest: value } = parseSnsMessage(message.Body, message.MessageAttributes)
  const { name, valueType } = attributes

  if (!name || !valueType) {
    throw new Error(
      `Feature control message missing required attributes (name, valueType): got ${JSON.stringify(attributes)}`
    )
  }

  return storeFeatureControl({ name, valueType, scopes: parseScopes(attributes.scopes), value })
}
