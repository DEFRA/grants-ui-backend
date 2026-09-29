import jwt from 'jsonwebtoken'
import { MockProvider, WebIdentityTokenProvider } from '@defra/hapi-auth-oidc'

import { config } from '../../../config.js'
import { createLogger } from '../../../common/helpers/logging/logger.js'

const logger = createLogger()

// The broker checks the token's exp on receipt, so refresh early enough that a
// token can't expire mid-request: one request budget plus some clock-skew slack.
const EARLY_REFRESH_SKEW_MS = 5_000

// CDP (per #cdp-support, 2026-09-29): the ECS task's own container credentials
// are refreshed ~300s before they expire, with jitter. Requesting the library's
// 300s default therefore asks for the same width as that refresh window itself -
// a request landing close to the refresh boundary can ask for a token that would
// outlive the (about to be replaced) container credentials, and STS rejects it
// ("Requested token expiry time must be before the original session's expiry
// time" - seen in prod 2026-09-28, grants-ui). A much shorter duration leaves
// comfortable room regardless of where in the refresh cycle the request lands.
const DURATION_SECONDS = 60

// Leaves at least 10s of the token's life usable even if CONFIG_BROKER_REQUEST_TIMEOUT_MS
// is configured close to/above DURATION_SECONDS - otherwise every token would be
// treated as due for refresh immediately, per DURATION_SECONDS above.
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
 * Whether a JWT's `exp` claim has already passed. Used to detect
 * WebIdentityTokenProvider silently handing back a stale token after a
 * failed refresh (it returns the last cached token rather than throwing) -
 * treated as `true` for anything we can't decode, so a malformed token is
 * never mistaken for a valid one.
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
 * Logs how close the ECS task's own AWS credentials (the ones underlying
 * every STS call, including GetWebIdentityToken - see #cdp-support,
 * 2026-09-29) were to their own expiry when a Web Identity refresh failed or
 * returned a stale token. `stsClient.config.credentials` is the SDK's own
 * memoized credential resolver (the same one whose 300s-before-expiry refresh
 * threshold is suspected of colliding with our token requests) - calling it
 * here reuses its cache rather than forcing a fresh fetch. Best-effort only:
 * MockProvider has no stsClient, and any failure here must never affect the
 * caller, so every error is swallowed.
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
 * refreshing it if expired. Sent to the broker as the raw Bearer token -
 * no second exchange with an identity provider, unlike the Entra flow.
 *
 * WebIdentityTokenProvider.getCredentials() can return a stale, already-expired
 * token after a failed refresh (it logs the failure but returns the last cached
 * token rather than null/throwing) - checking the token's own `exp` here stops
 * that stale token being reported as "ready" and sent to the broker, where it
 * would only fail with a more confusing error. No retry: a failure here
 * reflects a genuine upstream STS problem, and surfacing it immediately keeps
 * that visible rather than masking it behind an extra attempt.
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
