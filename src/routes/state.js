import Joi from 'joi'
import { logIfApproachingPayloadLimit } from '../common/helpers/logging/log-if-approaching-payload-limit.js'

const PAYLOAD_SIZE_WARNING_THRESHOLD = 500_000 // 500 KB
const PAYLOAD_SIZE_MAX = 1_048_576 // 1 MB

const stateSaveSchema = Joi.object({
  businessId: Joi.string().required(),
  userId: Joi.string().required(),
  grantId: Joi.string().required(),
  grantVersion: Joi.string().required(),
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
  grantVersion: Joi.string()
})

export const stateSave = {
  method: 'POST',
  path: '/state',
  options: {
    payload: {
      maxBytes: PAYLOAD_SIZE_MAX, // 1MB
      output: 'data',
      parse: true,
      allow: 'application/json'
    },
    validate: {
      payload: stateSaveSchema,
      failAction: (request, h, err) => {
        request.server.logger.error(`Validation failed: ${err.message}`, err)
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

      const errorMsg = [
        'Failed to save application state',
        `name=${err.name}`,
        `message=${err.message}`,
        `reason=${JSON.stringify(err.reason)}`,
        `code=${err.code}`,
        `isMongoError=${isMongoError}`,
        `stack=${err.stack?.split('\n')[0]}`
      ]
        .filter(Boolean)
        .join(' | ')

      request.server.logger.error(errorMsg)
      return h.response({ error: 'Failed to save application state' }).code(500)
    }
  }
}

export const stateRetrieve = {
  method: 'GET',
  path: '/state',
  options: {
    validate: {
      query: stateRetrieveSchema,
      failAction: (request, h, err) => {
        request.server.logger.error(`Validation failed: ${err.message}`, err)
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
        .findOne({ businessId, userId, grantId })

      if (!document) {
        return h.response({ error: 'State not found' }).code(404)
      }

      return h.response(document.state).code(200)
    } catch (err) {
      const isMongoError = err?.name?.startsWith('Mongo')

      const errorMsg = [
        'Failed to retrieve application state',
        `name=${err.name}`,
        `message=${err.message}`,
        `reason=${JSON.stringify(err.reason)}`,
        `code=${err.code}`,
        `isMongoError=${isMongoError}`,
        `stack=${err.stack?.split('\n')[0]}`
      ]
        .filter(Boolean)
        .join(' | ')

      request.server.logger.error(errorMsg)
      return h
        .response({ error: 'Failed to retrieve application state' })
        .code(500)
    }
  }
}
