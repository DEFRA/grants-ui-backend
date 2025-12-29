import Joi from 'joi'
import { logIfApproachingPayloadLimit } from '../common/helpers/logging/log-if-approaching-payload-limit.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import { releaseApplicationLock } from '../common/helpers/application-lock.js'

const PAYLOAD_SIZE_WARNING_THRESHOLD = 500_000 // 500 KB
const PAYLOAD_SIZE_MAX = 1_048_576 // 1 MB

const addSubmissionSchema = Joi.object({
  crn: Joi.string().required(),
  sbi: Joi.string().required(),
  grantCode: Joi.string().required(),
  grantVersion: Joi.number().required(),
  referenceNumber: Joi.string().required(),
  submittedAt: Joi.date().required()
})
  .required()
  .unknown(false) // Disallow unknown top-level fields

const retrieveSubmissionsSchema = Joi.object({
  crn: Joi.string(),
  sbi: Joi.string().required(),
  grantCode: Joi.string().required(),
  grantVersion: Joi.number(),
  referenceNumber: Joi.string()
})

export const addSubmission = {
  method: 'POST',
  path: '/submissions',
  options: {
    auth: 'bearer',
    payload: {
      maxBytes: PAYLOAD_SIZE_MAX, // 1MB
      output: 'data',
      parse: true,
      allow: 'application/json'
    },
    validate: {
      payload: addSubmissionSchema,
      failAction: (request, h, err) => {
        const { crn, sbi, grantCode, grantVersion, referenceNumber, submittedAt } = request.payload
        log(LogCodes.SUBMISSIONS.SUBMISSIONS_ADD_FAILED, {
          crn,
          sbi,
          grantCode,
          grantVersion,
          referenceNumber,
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

    const { crn, sbi, grantCode, grantVersion, referenceNumber, submittedAt } = request.payload

    const db = request.db

    try {
      await db.collection('grant_application_submissions').insertOne(request.payload)

      // Release application edit lock after successful submission
      await releaseApplicationLock(db, {
        grantCode,
        grantVersion,
        sbi,
        ownerId: request.auth.credentials.contactId
      })

      return h.response({ success: true, created: true }).code(201)
    } catch (err) {
      const isMongoError = err.name && err.name.startsWith('Mongo')

      log(LogCodes.SUBMISSIONS.SUBMISSIONS_ADD_FAILED, {
        crn,
        sbi,
        grantCode,
        grantVersion,
        referenceNumber,
        submittedAt,
        errorName: err.name,
        errorMessage: err.message,
        errorReason: err.reason,
        errorCode: err.code,
        isMongoError,
        stack: err.stack?.split('\n')[0]
      })

      return h.response({ error: 'Failed to add submission' }).code(500)
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
      failAction: (request, h, err) => {
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

    const db = request.db

    // Build filter object, excluding undefined values
    const filter = {
      sbi,
      grantCode,
      ...(crn && { crn }),
      ...(grantVersion !== undefined && { grantVersion }),
      ...(referenceNumber && { referenceNumber })
    }

    try {
      const documents = await db
        .collection('grant_application_submissions')
        .find(filter)
        .sort({ submittedAt: -1 })
        .toArray()

      return h.response(documents).code(200)
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

      return h.response({ error: 'Failed to retrieve submissions' }).code(500)
    }
  }
}
