import { config } from '../../config.js'

import { createServer } from '../../server.js'
import { createLogger } from './logging/logger.js'
import { migrateApplicantToAdditionalAnswers } from '../../migrations/migrate-applicant-to-additional-answers.js'

async function startServer() {
  let server

  try {
    server = await createServer()
    await migrateApplicantToAdditionalAnswers(server.db, server.logger)
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
