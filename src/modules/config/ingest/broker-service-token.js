import jwt from 'jsonwebtoken'
import { MockProvider, WebIdentityTokenProvider } from '@defra/hapi-auth-oidc'

import { config } from '../../../config.js'
import { createLogger } from '../../../common/helpers/logging/logger.js'

const logger = createLogger()

// The broker checks the token's exp on receipt, so refresh early enough that a
// token can't expire mid-request: one request budget plus some clock-skew slack.
const EARLY_REFRESH_SKEW_MS = 5_000

// Library default (300s) collides with the ~300s ECS container credential
// refresh window, causing STS to occasionally reject the request (prod
// grants-ui, 2026-09-28). See #cdp-support, 2026-09-29.
const DURATION_SECONDS = 60

// Leaves at least 10s of token life usable even if the request timeout is
// close to/above DURATION_SECONDS.
const MAX_EARLY_REFRESH_MS = (DURATION_SECONDS - 10) * 1000

/** @type {WebIdentityTokenProvider | MockProvider | null} */
let webIdentityTokenProvider = null

/**
 * Lazily creates (and caches) the token provider. Binds directly to the
 * service's IAM role via AWS STS - no stored secret. Locally, floci has no
 * GetWebIdentityToken support, so a MockProvider stands in instead.
 * @returns {WebIdentityTokenProvider | MockProvider}
 */
function getWebIdentityTokenProvider() {
  if (!webIdentityTokenProvider) {
    webIdentityTokenProvider =
      config.get('cdpEnvironment') === 'local'
        ? new MockProvider({})
        : new WebIdentityTokenProvider({
            audience: [config.get('configBroker.webIdentity.audience')],
            durationSeconds: DURATION_SECONDS,
            earlyRefreshMs: Math.min(
              MAX_EARLY_REFRESH_MS,
              config.get('configBroker.requestTimeoutMs') + EARLY_REFRESH_SKEW_MS
            )
          })
  }
  return webIdentityTokenProvider
}

/**
 * Resets the cached token provider. Test-only.
 * @returns {void}
 */
export function clearCachedBrokerServiceToken() {
  webIdentityTokenProvider = null
}

/**
 * Whether a JWT's `exp` has passed. WebIdentityTokenProvider can silently
 * return a stale cached token after a failed refresh, so this catches it.
 * @param {string} token
 * @returns {boolean}
 */
function isExpired(token) {
  const decoded = jwt.decode(token)
  if (!decoded || typeof decoded === 'string' || typeof decoded.exp !== 'number') {
    return true
  }
  return Date.now() >= decoded.exp * 1000
}

/**
 * Diagnostic: logs how close the ECS task's own AWS credentials were to
 * expiry when a Web Identity refresh failed. Best-effort - MockProvider has
 * no stsClient, so every error here is swallowed.
 * @param {WebIdentityTokenProvider | MockProvider} provider
 * @returns {Promise<void>}
 */
async function logUnderlyingCredentialExpiry(provider) {
  try {
    const credentials = await provider.stsClient?.config?.credentials?.()
    if (!credentials?.expiration) {
      return
    }
    const msRemaining = credentials.expiration.getTime() - Date.now()
    logger.warn(
      `[config-broker] underlying ECS task credentials expire at ${credentials.expiration.toISOString()} (${msRemaining}ms from now)`
    )
  } catch (error) {
    logger.warn(`[config-broker] could not read underlying ECS task credential expiry: ${error.message}`)
  }
}

/**
 * Returns a valid AWS STS Web Identity token for grants-config-broker,
 * refreshing it if expired. Sent as the raw Bearer token - no second
 * exchange, unlike the Entra flow. No retry on failure: fails fast rather
 * than masking a genuine STS problem.
 * @returns {Promise<string | undefined>} A valid Web Identity token
 */
export async function getBrokerServiceToken() {
  const audience = config.get('configBroker.webIdentity.audience')

  const provider = getWebIdentityTokenProvider()
  const token = await provider.getCredentials(logger)
  if (token && !isExpired(token)) {
    logger.info(`[config-broker] Web Identity token ready (audience=${audience})`)
    return token
  }

  logger.warn(`[config-broker] no valid Web Identity token available (audience=${audience})`)
  await logUnderlyingCredentialExpiry(provider)
  return undefined
}
