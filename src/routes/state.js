import Joi from 'joi'

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
      maxBytes: 1048576, // 1MB
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
    const payloadSize = Buffer.byteLength(JSON.stringify(request.payload || {}))
    request.server.logger.info(`Received payload of size: ${payloadSize} bytes`)

    // Optional: log a warning if too large
    if (payloadSize > 500_000) {
      request.server.logger.warn(
        `Large payload detected (${payloadSize} bytes)`,
        {
          userId: request.payload?.userId,
          path: request.path,
          size: payloadSize
        }
      )
    }

    const { businessId, userId, grantId, grantVersion, state, relevantState } =
      request.payload

    const db = request.db

    const updateDoc = {
      $set: { state, relevantState, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() }
    }

    try {
      await db
        .collection('grant-application-state')
        .updateOne({ businessId, userId, grantId, grantVersion }, updateDoc, {
          upsert: true
        })

      return h.response({ success: true }).code(200)
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
