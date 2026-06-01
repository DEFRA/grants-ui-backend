import { config } from '../../config.js'
import { createServer } from '../../server.js'
import { createLogger } from './logging/logger.js'
import { migrateApplicantToAdditionalAnswers } from '../../migrations/migrate-applicant-to-additional-answers.js'
import { runStartupPull } from '../../modules/config/ingest/startup-pull.js'

// The config broker can report healthy (and even list a grant) before it has
// finished publishing that version's objects to S3. In that window the startup
// pull either throws or completes with per-version failures. We retry the pull a
// bounded number of times so a freshly-started broker (notably in CI, where the
// broker image is pulled cold) is given time to warm up before the server comes
// up; once the pull completes with no failures we stop immediately.
const STARTUP_PULL_MAX_ATTEMPTS = 12
const STARTUP_PULL_RETRY_DELAY_MS = 2500

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function runStartupPullWithRetry(logger) {
  for (let attempt = 1; attempt <= STARTUP_PULL_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await runStartupPull()
      if (!result?.failed) {
        return
      }
      logger.warn(
        { attempt, ...result },
        'Broker startup pull completed with failures; retrying in case the broker is still warming up'
      )
    } catch (err) {
      logger.warn({ err, attempt }, 'Broker startup pull attempt failed; retrying')
    }

    if (attempt < STARTUP_PULL_MAX_ATTEMPTS) {
      await sleep(STARTUP_PULL_RETRY_DELAY_MS)
    }
  }
  logger.error('Broker startup pull did not fully succeed after retries; continuing with existing DB state')
}

async function startServer() {
  let server

  try {
    server = await createServer()
    await migrateApplicantToAdditionalAnswers(server.stateDb, server.logger)

    await runStartupPullWithRetry(server.logger)

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
