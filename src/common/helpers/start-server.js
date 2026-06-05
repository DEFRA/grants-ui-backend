import { config } from '../../config.js'
import { createServer } from '../../server.js'
import { createLogger } from './logging/logger.js'
import { runStartupPull } from '../../modules/config/ingest/startup-pull.js'
import { runMigrations } from './run-migrations.js'
import stateMongoConfig from '../../../migrate-mongo-config.state.js'
import configMongoConfig from '../../../migrate-mongo-config.config.js'

async function startServer() {
  let server

  try {
    server = await createServer()

    // Run migrations. Across multiple ECS instances, migrate-mongo's changelog
    // lock (lockTtl > 0) lets exactly one instance apply pending migrations;
    // the others back-off/poll until the lock clears, then start normally.
    await runMigrations(server.stateDb, stateMongoConfig)
    await runMigrations(server.configDb, configMongoConfig)

    // Best-effort startup pull from the config broker. If the broker is not yet
    // ready (e.g. cold start), we log and continue with the existing DB state;
    // the live SQS config-update consumer reconciles the DB once the broker
    // publishes. We deliberately do not block startup on broker warm-up timing.
    try {
      await runStartupPull()
    } catch (err) {
      server.logger.error({ err }, 'Broker startup pull failed; continuing with existing DB state')
    }

    await server.start()

    server.logger.info('Server started successfully')
    server.logger.info(`Access your backend on http://localhost:${config.get('port')}`)
  } catch (error) {
    const logger = createLogger()
    logger.error('Server failed to start :(')
    logger.error(error)
    // Fail the boot loudly so CDP/ECS health checks catch a broken instance
    // instead of treating a failed migration as a healthy server.
    throw error
  }

  return server
}

export { startServer }
