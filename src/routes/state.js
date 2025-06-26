import Joi from 'joi'
import { logIfApproachingPayloadLimit } from '../common/helpers/logging/log-if-approaching-payload-limit'

const PAYLOAD_SIZE_WARNING_THRESHOLD = 500_000 // 500 KB
const PAYLOAD_SIZE_MAX = 1_048_576 // 1 MB

const stateSaveSchema = Joi.object({
  businessId: Joi.string().required(),
  userId: Joi.string().required(),
  grantId: Joi.string().required(),
  grantVersion: Joi.string().required(),
  state: Joi.object().unknown(true).required().messages({
    'object.base': '"state" must be an object'
  }),
  relevantState: Joi.object().unknown(true).required().messages({
    'object.base': '"relevantState" must be an object'
  })
})
  .required()
  .unknown(false) // Disallow unknown top-level fields

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
        request.server.logger.warn('Validation failed:', err)
        throw err
      }
    }
  },
  handler: async (request, h) => {
    logIfApproachingPayloadLimit(request, {
      threshold: PAYLOAD_SIZE_WARNING_THRESHOLD,
      max: PAYLOAD_SIZE_MAX
    })

    const { businessId, userId, grantId, grantVersion, state, relevantState } =
      request.payload

    const db = request.db

    const updateDoc = {
      $set: { state, relevantState, updatedAt: new Date() },
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
