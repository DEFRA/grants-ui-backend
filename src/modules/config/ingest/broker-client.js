import { config } from '../../../config.js'
import { buildBrokerBearerHeader } from './broker-auth.js'

/**
 * @typedef {Object} BrokerVersion
 * @property {string} grant
 * @property {string} version
 * @property {'active'|'draft'} status
 * @property {string} path
 * @property {string[]} [manifest]
 * @property {string} [lastUpdated]
 */

/**
 * @typedef {Object} BrokerGrantVersionSummary
 * @property {string} version
 * @property {'active'|'draft'} status
 * @property {string} lastUpdated
 */

/**
 * @typedef {Object} BrokerGrantSummary
 * @property {string} grant
 * @property {BrokerGrantVersionSummary[]} versions
 */

/**
 * Returns the Authorization header used to call the broker.
 */
function buildAuthHeader() {
  const headers = {}

  const token = config.get('configBroker.authToken')
  const key = config.get('configBroker.encryptionKey')
  if (token && key) {
    headers.Authorization = buildBrokerBearerHeader(token, key)
  }
  return headers
}

const SLASH_CHAR_CODE = 47 // '/'

/**
 * Removes any trailing slash characters from the given URL without using a
 * backtracking-prone regular expression.
 *
 * @param {string} url
 * @returns {string}
 */
function stripTrailingSlashes(url) {
  let end = url.length
  while (end > 0 && url.codePointAt(end - 1) === SLASH_CHAR_CODE) {
    end--
  }
  return url.slice(0, end)
}

/**
 * Performs a GET against the broker and returns the parsed JSON body.
 *
 * @param {string} pathAndQuery
 * @returns {Promise<unknown>}
 */
async function brokerGet(pathAndQuery) {
  const baseUrl = stripTrailingSlashes(config.get('configBroker.baseUrl'))
  const url = `${baseUrl}${pathAndQuery}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.get('configBroker.requestTimeoutMs'))

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json', ...buildAuthHeader() },
      signal: controller.signal
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Broker request failed: GET ${pathAndQuery} -> ${response.status} ${body}`)
    }

    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Returns all versions of all grants (including drafts).
 *
 * @returns {Promise<BrokerGrantSummary[]>}
 */
export function fetchAllGrants() {
  return brokerGet('/api/allGrants?draft=include')
}

/**
 * Returns a specific version of a grant configuration.
 *
 * @param {string} grant
 * @param {string} version
 * @returns {Promise<BrokerVersion>}
 */
export function fetchVersion(grant, version) {
  const params = new URLSearchParams({ grant, version })
  return brokerGet(`/api/version?${params.toString()}`)
}
