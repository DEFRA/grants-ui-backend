import Joi from 'joi'
import { logIfApproachingPayloadLimit } from '../common/helpers/logging/log-if-approaching-payload-limit.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'

const PAYLOAD_SIZE_WARNING_THRESHOLD = 500_000 // 500 KB
const PAYLOAD_SIZE_MAX = 1_048_576 // 1 MB

const stateSaveSchema = Joi.object({
  businessId: Joi.string().required(),
  userId: Joi.string().required(),
  grantId: Joi.string().required(),
  grantVersion: Joi.number().required(),
  state: Joi.object().unknown(true).required().messages({
    'object.base': '"state" must be an object'
  })
})
  .required()
  .unknown(false) // Disallow unknown top-level fields

const stateRetrieveSchema = Joi.object({
  businessId: Joi.string().required(),
  userId: Joi.string().required(),
  grantId: Joi.string().required(),
  grantVersion: Joi.number()
})

export const stateSave = {
  method: 'POST',
  path: '/state',
  options: {
    auth: 'bearer-basic-auth',
    payload: {
      maxBytes: PAYLOAD_SIZE_MAX, // 1MB
      output: 'data',
      parse: true,
      allow: 'application/json'
    },
    validate: {
      payload: stateSaveSchema,
      failAction: (request, h, err) => {
        const { businessId, userId, grantId, grantVersion } = request.payload
        log(LogCodes.STATE.STATE_SAVE_FAILED, {
          userId,
          businessId,
          grantId,
          grantVersion,
          errorName: err.name,
          errorMessage: `POST /state, validation failed: ${err.message}`,
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

    const { businessId, userId, grantId, grantVersion, state } = request.payload

    const db = request.db

    const updateDoc = {
      $set: { state, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() }
    }

    try {
      const result = await db
        .collection('grant-application-state')
        .updateOne({ businessId, userId, grantId, grantVersion }, updateDoc, {
          upsert: true
        })

      if (result.upsertedCount > 0) {
        return h.response({ success: true, created: true }).code(201)
      }

      return h.response({ success: true, updated: true }).code(200)
    } catch (err) {
      const isMongoError = err.name && err.name.startsWith('Mongo')

      log(LogCodes.STATE.STATE_SAVE_FAILED, {
        userId,
        businessId,
        grantId,
        errorName: err.name,
        errorMessage: err.message,
        errorReason: err.reason,
        errorCode: err.code,
        isMongoError,
        stack: err.stack?.split('\n')[0]
      })

      return h.response({ error: 'Failed to save application state' }).code(500)
    }
  }
}

export const stateRetrieve = {
  method: 'GET',
  path: '/state',
  options: {
    auth: 'bearer-basic-auth',
    validate: {
      query: stateRetrieveSchema,
      failAction: (request, h, err) => {
        const { businessId, userId, grantId } = request.query
        log(LogCodes.STATE.STATE_RETRIEVE_FAILED, {
          userId,
          businessId,
          grantId,
          errorName: err.name,
          errorMessage: `GET /state, validation failed: ${err.message}`,
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
    const { businessId, userId, grantId } = request.query

    const db = request.db

    try {
      const document = await db
        .collection('grant-application-state')
        .find({ businessId, userId, grantId })
        .sort({ grantVersion: -1 }) // numeric descending
        .limit(1)
        .next()

      if (!document) {
        return h.response({ error: 'State not found' }).code(404)
      }

      return h.response(document.state).code(200)
    } catch (err) {
      const isMongoError = err?.name?.startsWith('Mongo')

      log(LogCodes.STATE.STATE_RETRIEVE_FAILED, {
        userId,
        businessId,
        grantId,
        errorName: err.name,
        errorMessage: err.message,
        errorReason: err.reason,
        errorCode: err.code,
        isMongoError,
        stack: err.stack?.split('\n')[0]
      })

      return h.response({ error: 'Failed to retrieve application state' }).code(500)
    }
  }
}

export const stateDelete = {
  method: 'DELETE',
  path: '/state',
  options: {
    auth: 'bearer-basic-auth',
    validate: {
      query: stateRetrieveSchema,
      failAction: (request, h, err) => {
        const { businessId, userId, grantId } = request.query
        log(LogCodes.STATE.STATE_DELETE_FAILED, {
          userId,
          businessId,
          grantId,
          errorName: err.name,
          errorMessage: `DELETE /state, validation failed: ${err.message}`,
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
    const { businessId, userId, grantId } = request.query

    const db = request.db

    try {
      const doc = await db
        .collection('grant-application-state')
        .find({ businessId, userId, grantId })
        .sort({ grantVersion: -1 })
        .limit(1)
        .next()

      if (!doc) {
        return h.response({ error: 'State not found' }).code(404)
      }

      await db.collection('grant-application-state').deleteOne({ _id: doc._id })

      return h.response({ success: true, deleted: true }).code(200)
    } catch (err) {
      const isMongoError = err?.name?.startsWith('Mongo')

      log(LogCodes.STATE.STATE_DELETE_FAILED, {
        userId,
        businessId,
        grantId,
        errorName: err.name,
        errorMessage: err.message,
        errorReason: err.reason,
        errorCode: err.code,
        isMongoError,
        stack: err.stack?.split('\n')[0]
      })
      return h.response({ error: 'Failed to delete application state' }).code(500)
    }
  }
}
