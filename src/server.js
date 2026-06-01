import Hapi from '@hapi/hapi'

import { config } from './config.js'
import { router } from './plugins/router.js'
import { auth } from './plugins/auth.js'
import { requestLogger } from './common/helpers/logging/request-logger.js'
import { mongoDb } from './common/helpers/mongodb.js'
import { createStateIndexes, initStateRepository } from './modules/state/state.repository.js'
import { createConfigIndexes, initConfigRepository } from './modules/config/config.repository.js'
import { failAction } from './common/helpers/fail-action.js'
import { secureContext } from './common/helpers/secure-context/index.js'
import { pulse } from './common/helpers/pulse.js'
import { requestTracing } from './common/helpers/request-tracing.js'
import { setupProxy } from './common/helpers/proxy/setup-proxy.js'
import { applicationLockPlugin } from './modules/state/lock-enforcement.js'
import { sqsConsumerPlugin } from './modules/config/ingest/sqs-consumer.js'

async function createServer() {
  setupProxy()
  const server = Hapi.server({
    host: config.get('host'),
    port: config.get('port'),
    routes: {
      validate: {
        options: {
          abortEarly: false
        },
        failAction
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: 'enabled',
        noSniff: true,
        xframe: true
      }
    },
    router: {
      stripTrailingSlash: true
    }
  })

  // Hapi Plugins:
  // requestLogger  - automatically logs incoming requests
  // requestTracing - trace header logging and propagation
  // secureContext  - loads CA certificates from environment config
  // pulse          - provides shutdown handlers
  // mongoDb        - sets up mongo connection pool and attaches to `server` and `request` objects
  // auth           - provides service-to-service authentication
  // router         - routes used in the app
  await server.register([
    requestLogger,
    requestTracing,
    secureContext,
    pulse,
    {
      plugin: mongoDb.plugin,
      options: {
        decorationKey: 'state',
        mongoUri: config.get('mongoState.uri'),
        databaseName: config.get('mongoState.databaseName'),
        maxPoolSize: config.get('mongoState.maxPoolSize'),
        minPoolSize: config.get('mongoState.minPoolSize'),
        maxIdleTimeMS: config.get('mongoState.maxIdleTimeMS'),
        createIndexes: createStateIndexes
      }
    },
    {
      plugin: mongoDb.plugin,
      options: {
        decorationKey: 'config',
        mongoUri: config.get('mongoConfig.uri'),
        databaseName: config.get('mongoConfig.databaseName'),
        maxPoolSize: config.get('mongoConfig.maxPoolSize'),
        minPoolSize: config.get('mongoConfig.minPoolSize'),
        maxIdleTimeMS: config.get('mongoConfig.maxIdleTimeMS'),
        createIndexes: createConfigIndexes
      }
    },
    auth,
    applicationLockPlugin,
    sqsConsumerPlugin,
    router
  ])

  // Repositories are initialised after plugin registration so that
  // server.stateDb / server.configDb decorations are available.
  initStateRepository(server.stateDb)
  initConfigRepository(server.configDb)

  return server
}

export { createServer }
