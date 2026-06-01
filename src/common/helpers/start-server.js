import { config } from '../../config.js'
import { createServer } from '../../server.js'
import { createLogger } from './logging/logger.js'
import { migrateApplicantToAdditionalAnswers } from '../../migrations/migrate-applicant-to-additional-answers.js'
import { runStartupPull } from '../../modules/config/ingest/startup-pull.js'

// The config broker can report healthy before it has finished publishing its
// grants. In that window the startup pull either throws, returns an empty grant
// list (so total === 0), or completes with per-version failures (because the
// version's S3 objects are not published yet). We retry the pull a bounded
// number of times so a freshly-started broker (notably in CI, where the broker
// image is pulled cold) is given time to warm up before the server comes up;
// once the pull has actually upserted/confirmed at least one version with no
// failures we stop immediately.
const STARTUP_PULL_MAX_ATTEMPTS = 12
const STARTUP_PULL_RETRY_DELAY_MS = 2500

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function runStartupPullWithRetry(logger) {
  for (let attempt = 1; attempt <= STARTUP_PULL_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await runStartupPull()
      // Treat the pull as successful only when the broker actually returned at
      // least one version (total > 0) and none of them failed to ingest. A
      // total of 0 means the broker is healthy but has not yet listed its
      // grants, so we keep retrying rather than starting with an empty DB.
      if (result?.total > 0 && !result.failed) {
        return
      }
      logger.warn(
        { attempt, ...result },
        'Broker startup pull did not fully succeed (empty grant list or failures); retrying in case the broker is still warming up'
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
