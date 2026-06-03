import { config } from '../../config.js'
import { createServer } from '../../server.js'
import { createLogger } from './logging/logger.js'
import { migrateApplicantToAdditionalAnswers } from '../../migrations/migrate-applicant-to-additional-answers.js'
import { runStartupPull } from '../../modules/config/ingest/startup-pull.js'

async function startServer() {
  let server

  try {
    server = await createServer()
    await migrateApplicantToAdditionalAnswers(server.stateDb, server.logger)

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
  }

  return server
}

export { startServer }
