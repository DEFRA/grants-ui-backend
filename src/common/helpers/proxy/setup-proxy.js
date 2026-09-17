import https from 'node:https'
import http from 'node:http'
import Wreck from '@hapi/wreck'

import { createLogger } from '../logging/logger.js'
import { config } from '../../../config.js'

const logger = createLogger()

/**
 * Routes outbound calls through the CDP proxy. Node's native fetch/undici
 * pick up HTTPS_PROXY automatically once NODE_USE_ENV_PROXY is set on the
 * process (see cdp-app-config) - that must happen before the process starts,
 * so there's nothing to bootstrap here for them. @hapi/wreck (used by
 * @hapi/jwt's JWKS fetch) has its own default agents, so it needs pointing at
 * Node's global agents explicitly. See
 * https://github.com/DEFRA/cdp-documentation/blob/main/how-to/proxy.md
 */
export function setupProxy() {
  if (config.get('httpProxy')) {
    logger.info('Routing @hapi/wreck through the native proxy agents')
    Wreck.agents.https = https.globalAgent
    Wreck.agents.http = http.globalAgent
  }
}
