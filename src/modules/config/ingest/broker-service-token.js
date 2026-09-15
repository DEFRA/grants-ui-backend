import { WebIdentityTokenProvider } from '@defra/hapi-auth-oidc'

import { config } from '../../../config.js'
import { createLogger } from '../../../common/helpers/logging/logger.js'

const logger = createLogger()

/** @type {WebIdentityTokenProvider | null} */
let webIdentityTokenProvider = null

/**
 * Lazily creates (and caches) the Web Identity token provider used to
 * authenticate to grants-config-broker. This binds directly to the service's
 * IAM role via AWS STS - no stored secret involved. The provider itself
 * caches the token, checks its real expiry (decoding the JWT), and coalesces
 * concurrent refresh calls into a single in-flight request.
 * @returns {WebIdentityTokenProvider}
 */
function getWebIdentityTokenProvider() {
  if (!webIdentityTokenProvider) {
    webIdentityTokenProvider = new WebIdentityTokenProvider({
      audience: [config.get('configBroker.webIdentity.audience')]
    })
  }
  return webIdentityTokenProvider
}

/**
 * Resets the cached Web Identity token provider. Test-only.
 * @returns {void}
 */
export function clearCachedBrokerServiceToken() {
  webIdentityTokenProvider = null
}

/**
 * Returns a valid AWS STS Web Identity token for grants-config-broker,
 * refreshing it if expired or not yet fetched. Unlike the Entra federated
 * credential flow, this token is sent directly to the broker as the Bearer
 * token - the broker validates it itself against
 * CDP_JWT_ISSUER/CDP_JWT_JWKS_URI, there is no second token exchange with an
 * identity provider.
 *
 * Note: WebIdentityTokenProvider.getCredentials() does not throw on an STS
 * failure - it logs the error itself (visible via the [Web Identity] prefix)
 * and resolves with whatever token it had cached before (possibly none). We
 * only add the audience-tagged [config-broker] log lines on top of that.
 * @returns {Promise<string | undefined>} A valid Web Identity token
 */
export async function getBrokerServiceToken() {
  const audience = config.get('configBroker.webIdentity.audience')

  const token = await getWebIdentityTokenProvider().getCredentials(logger)
  if (token) {
    logger.info(`[config-broker] Web Identity token ready (audience=${audience})`)
  } else {
    logger.warn(`[config-broker] no Web Identity token available (audience=${audience})`)
  }
  return token ?? undefined
}
