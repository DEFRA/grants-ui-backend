import { logIfApproachingPayloadLimit } from '../../common/helpers/logging/log-if-approaching-payload-limit.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'
import { releaseApplicationLock, insertSubmission, findSubmissions } from './state.service.js'
import { enforceApplicationLock, extractLockKeys } from './lock-enforcement.js'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { addSubmissionSchema, retrieveSubmissionsSchema, normalizeGrantVersion } from './state.schema.js'

const PAYLOAD_SIZE_WARNING_THRESHOLD = 500_000 // 500 KB
const PAYLOAD_SIZE_MAX = 1_048_576 // 1 MB

export const addSubmission = {
  method: 'POST',
  path: '/submissions',
  options: {
    auth: 'bearer',
    pre: [{ method: enforceApplicationLock }],
    payload: {
      maxBytes: PAYLOAD_SIZE_MAX, // 1MB
      output: 'data',
      parse: true,
      allow: 'application/json'
    },
    validate: {
      payload: addSubmissionSchema,
      failAction: (request, _h, err) => {
        const { crn, sbi, grantCode, grantVersion, referenceNumber, previousReferenceNumber, submittedAt } =
          request.payload
        log(LogCodes.SUBMISSIONS.SUBMISSIONS_ADD_FAILED, {
          crn,
          sbi,
          grantCode,
          grantVersion,
          referenceNumber,
          previousReferenceNumber,
          submittedAt,
          errorName: err.name,
          errorMessage: `POST /submissions, validation failed: ${err.message}`,
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
    logIfApproachingPayloadLimit(request, {
      threshold: PAYLOAD_SIZE_WARNING_THRESHOLD,
      max: PAYLOAD_SIZE_MAX
    })

    const { crn, sbi, grantCode, grantVersion, referenceNumber, previousReferenceNumber, submittedAt } = request.payload

    const {
      ownerId,
      sbi: tokenSbi,
      grantCode: tokenGrantCode,
      grantVersion: tokenGrantVersion
    } = extractLockKeys(request)

    if (tokenSbi !== sbi) {
      throw Boom.badRequest('SBI in payload does not match lock token')
    }
    if (tokenGrantCode !== grantCode) {
      throw Boom.badRequest('Grant code in payload does not match lock token')
    }
    if (normalizeGrantVersion(tokenGrantVersion) !== normalizeGrantVersion(grantVersion)) {
      throw Boom.badRequest('Grant version in payload does not match lock token')
    }

    try {
      await insertSubmission(request.payload)

      await releaseApplicationLock({
        grantCode,
        grantVersion,
        sbi,
        ownerId
      })

      return h.response({ success: true, created: true }).code(StatusCodes.CREATED)
    } catch (err) {
      const isMongoError = err.name?.startsWith('Mongo')

      log(LogCodes.SUBMISSIONS.SUBMISSIONS_ADD_FAILED, {
        crn,
        sbi,
        grantCode,
        grantVersion,
        referenceNumber,
        previousReferenceNumber,
        submittedAt,
        errorName: err.name,
        errorMessage: err.message,
        errorReason: err.reason,
        errorCode: err.code,
        isMongoError,
        stack: err.stack?.split('\n')[0]
      })

      return h.response({ error: 'Failed to add submission' }).code(StatusCodes.INTERNAL_SERVER_ERROR)
    }
  }
}

export const retrieveSubmissions = {
  method: 'GET',
  path: '/submissions',
  options: {
    auth: 'bearer',
    validate: {
      query: retrieveSubmissionsSchema,
      failAction: (request, _h, err) => {
        const { crn, sbi, grantCode, grantVersion, referenceNumber } = request.query
        log(LogCodes.SUBMISSIONS.SUBMISSIONS_RETRIEVE_FAILED, {
          crn,
          sbi,
          grantCode,
          grantVersion,
          referenceNumber,
          errorName: err.name,
          errorMessage: `GET /submissions, validation failed: ${err.message}`,
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
    const { crn, sbi, grantCode, grantVersion, referenceNumber } = request.query

    // Build filter object, excluding undefined values
    const filter = {
      sbi,
      grantCode,
      ...(crn && { crn }),
      ...(grantVersion !== undefined && { grantVersion }),
      ...(referenceNumber && { referenceNumber })
    }

    try {
      const documents = await findSubmissions(filter)

      return h.response(documents).code(StatusCodes.OK)
    } catch (err) {
      const isMongoError = err?.name?.startsWith('Mongo')

      log(LogCodes.SUBMISSIONS.SUBMISSIONS_RETRIEVE_FAILED, {
        crn,
        sbi,
        grantCode,
        grantVersion,
        referenceNumber,
        errorName: err.name,
        errorMessage: err.message,
        errorReason: err.reason,
        errorCode: err.code,
        isMongoError,
        stack: err.stack?.split('\n')[0]
      })

      return h.response({ error: 'Failed to retrieve submissions' }).code(StatusCodes.INTERNAL_SERVER_ERROR)
    }
  }
}
