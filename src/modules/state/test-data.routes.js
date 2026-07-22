import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { config } from '../../config.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'
import { clearTestDataSchema } from './state.schema.js'
import { clearTestData } from './state.service.js'

// Environments where automated test suites run and destructive-by-SBI cleanup is safe.
const TEST_DATA_CLEAR_ALLOWED_ENVIRONMENTS = new Set(['local', 'dev', 'test', 'perf-test', 'ext-test'])

export const clearTestDataRoute = {
  method: 'DELETE',
  path: '/admin/test-data',
  options: {
    auth: 'bearer',
    validate: {
      query: clearTestDataSchema,
      failAction: (request, _h, err) => {
        const { sbi, grantCode } = request.query
        log(LogCodes.TEST_DATA.CLEAR_FAILED, {
          sbi,
          grantCode,
          errorName: err.name,
          errorMessage: `DELETE /admin/test-data, validation failed: ${err.message}`,
          errorReason: err.reason,
          errorCode: err.code,
          isMongoError: false,
          stack: err.stack?.split('\n')[0]
        })
        throw err
      }
    }
  },
  handler: async (request, h) => {
    const { sbi, grantCode } = request.query
    const cdpEnvironment = config.get('cdpEnvironment')

    if (!TEST_DATA_CLEAR_ALLOWED_ENVIRONMENTS.has(cdpEnvironment)) {
      log(LogCodes.TEST_DATA.CLEAR_FORBIDDEN, { sbi, grantCode, cdpEnvironment })
      throw Boom.forbidden('Test data clear-down is not permitted in this environment')
    }

    try {
      const result = await clearTestData({ sbi, grantCode })

      log(LogCodes.TEST_DATA.CLEARED, {
        sbi,
        grantCode,
        stateDeletedCount: result.stateDeletedCount,
        submissionsDeletedCount: result.submissionsDeletedCount,
        locksDeletedCount: result.locksDeletedCount
      })

      return h.response({ success: true, ...result }).code(StatusCodes.OK)
    } catch (err) {
      const isMongoError = err?.name?.startsWith('Mongo')

      log(LogCodes.TEST_DATA.CLEAR_FAILED, {
        sbi,
        grantCode,
        errorName: err.name,
        errorMessage: err.message,
        errorReason: err.reason,
        errorCode: err.code,
        isMongoError,
        stack: err.stack?.split('\n')[0]
      })

      return h.response({ error: 'Failed to clear test data' }).code(StatusCodes.INTERNAL_SERVER_ERROR)
    }
  }
}
