import { config } from '../../config.js'
import { createServer } from '../../server.js'
import { createLogger } from './logging/logger.js'
import { runStartupPull } from '../../modules/config/ingest/startup-pull.js'
import { runMigrations } from './run-migrations.js'
import stateMongoConfig from '../../../migrate-mongo-config.state.js'
import configMongoConfig from '../../../migrate-mongo-config.config.js'
import { runStartupPurge } from '../../modules/state/purge-unsubmitted-applications.js'

/**
 * Runs a startup task that must not stop the server from booting.
 * @param {import('@hapi/hapi').Server} server
 * @param {string} label - what failed, e.g. `Startup purge`
 * @param {() => Promise<unknown>} task
 */
async function runBestEffort(server, label, task) {
  try {
    await task()
  } catch (err) {
    server.logger.error({ err }, `${label} failed; continuing with existing DB state`)
  }
}

async function startServer() {
  let server

  try {
    server = await createServer()

    // Run migrations across multiple ECS instances.
    await runMigrations(server.stateDb, stateMongoConfig)
    await runMigrations(server.configDb, configMongoConfig)

    await runBestEffort(server, 'Startup purge', runStartupPurge)

    // Best-effort startup pull from the config broker. If the broker is not yet
    // ready (e.g. cold start), we log and continue with the existing DB state;
    // the live SQS config-update consumer reconciles the DB once the broker
    // publishes. We deliberately do not block startup on broker warm-up timing.
    await runBestEffort(server, 'Broker startup pull', runStartupPull)

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
