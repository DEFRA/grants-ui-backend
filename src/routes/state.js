import Joi from 'joi'
import { logIfApproachingPayloadLimit } from '../common/helpers/logging/log-if-approaching-payload-limit.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import { enforceApplicationLock } from '../plugins/application-lock-enforcement.js'

const PAYLOAD_SIZE_WARNING_THRESHOLD = 500_000 // 500 KB
const PAYLOAD_SIZE_MAX = 1_048_576 // 1 MB

const stateSaveSchema = Joi.object({
  sbi: Joi.string().required(),
  grantCode: Joi.string().required(),
  grantVersion: Joi.number().required(),
  state: Joi.object().unknown(true).required().messages({
    'object.base': '"state" must be an object'
  })
})
  .required()
  .unknown(false) // Disallow unknown top-level fields

const stateRetrieveSchema = Joi.object({
  sbi: Joi.string().required(),
  grantCode: Joi.string().required(),
  grantVersion: Joi.number()
})

const patchParamsSchema = Joi.object({
  sbi: Joi.string().required(),
  grantCode: Joi.string().required()
})

const patchSchema = Joi.object({
  state: Joi.object({
    applicationStatus: Joi.string().required()
  })
    .required()
    .unknown(false) // Disallow any other state.* fields
})
  .required()
  .unknown(false) // Disallow unknown top-level fields

export const stateSave = {
  method: 'POST',
  path: '/state',
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
      payload: stateSaveSchema,
      failAction: (request, h, err) => {
        const { sbi, grantCode, grantVersion } = request.payload
        log(LogCodes.STATE.STATE_SAVE_FAILED, {
          sbi,
          grantCode,
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

    const { sbi, grantCode, grantVersion, state } = request.payload

    const db = request.db

    const updateDoc = {
      $set: {
        state: {
          ...state,
          ...(state?.submittedAt ? { submittedAt: new Date(state.submittedAt) } : {})
        }
      },
      $currentDate: { updatedAt: true },
      $setOnInsert: { createdAt: new Date() }
    }

    try {
      const result = await db
        .collection('grant-application-state')
        .updateOne({ sbi, grantCode, grantVersion }, updateDoc, {
          upsert: true
        })

      if (result.upsertedCount > 0) {
        return h.response({ success: true, created: true }).code(201)
      }

      return h.response({ success: true, updated: true }).code(200)
    } catch (err) {
      const isMongoError = err.name && err.name.startsWith('Mongo')

      log(LogCodes.STATE.STATE_SAVE_FAILED, {
        sbi,
        grantCode,
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
    auth: 'bearer',
    pre: [{ method: enforceApplicationLock }],
    validate: {
      query: stateRetrieveSchema,
      failAction: (request, h, err) => {
        const { sbi, grantCode } = request.query
        log(LogCodes.STATE.STATE_RETRIEVE_FAILED, {
          sbi,
          grantCode,
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
    console.log('[BE] Incoming headers:', request.headers)
    const { sbi, grantCode } = request.query

    const db = request.db

    try {
      const document = await db
        .collection('grant-application-state')
        .find({ sbi, grantCode })
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
        sbi,
        grantCode,
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
    auth: 'bearer',
    pre: [{ method: enforceApplicationLock }],
    validate: {
      query: stateRetrieveSchema,
      failAction: (request, h, err) => {
        const { sbi, grantCode } = request.query
        log(LogCodes.STATE.STATE_DELETE_FAILED, {
          sbi,
          grantCode,
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
    const { sbi, grantCode } = request.query

    const db = request.db

    try {
      const doc = await db
        .collection('grant-application-state')
        .find({ sbi, grantCode })
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
        sbi,
        grantCode,
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

export const statePatch = {
  method: 'PATCH',
  path: '/state/{sbi}/{grantCode}',
  options: {
    auth: 'bearer',
    pre: [{ method: enforceApplicationLock }],
    payload: {
      maxBytes: PAYLOAD_SIZE_MAX, // 1MB
      parse: true,
      output: 'data',
      allow: ['application/json']
    },
    validate: {
      params: patchParamsSchema,
      payload: patchSchema,
      failAction: (request, h, err) => {
        const { sbi, grantCode } = request.params
        log(LogCodes.STATE.STATE_PATCH_FAILED, {
          sbi,
          grantCode,
          errorName: err.name,
          errorMessage: `PATCH /state, validation failed: ${err.message}`,
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
    const { sbi, grantCode } = request.params
    const { applicationStatus } = request.payload.state

    try {
      const document = await request.db.collection('grant-application-state').findOneAndUpdate(
        { sbi, grantCode },
        {
          $set: {
            'state.applicationStatus': applicationStatus,
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after', upsert: false }
      )

      if (!document) {
        return h.response({ error: 'State not found' }).code(404)
      }

      return h.response({ success: true, patched: true }).code(200)
    } catch (err) {
      const isMongoError = err?.name?.startsWith('Mongo')

      log(LogCodes.STATE.STATE_PATCH_FAILED, {
        sbi,
        grantCode,
        errorName: err.name,
        errorMessage: err.message,
        errorReason: err.reason,
        errorCode: err.code,
        isMongoError,
        stack: err.stack?.split('\n')[0]
      })
      return h.response({ error: 'Failed to patch application state' }).code(500)
    }
  }
}
