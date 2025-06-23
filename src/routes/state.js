import Joi from 'joi'

const stateSaveSchema = Joi.object({
  businessId: Joi.string().required(),
  userId: Joi.string().required(),
  grantId: Joi.string().required(),
  grantVersion: Joi.string().required(),
  state: Joi.object().required(),
  relevantState: Joi.object().optional()
})

export const stateSave = {
  method: 'POST',
  path: '/state/save',
  options: {
    validate: {
      payload: stateSaveSchema,
      failAction: (request, h, err) => {
        request.server.logger.warn('Validation failed:', err)
        throw err
      }
    }
  },
  handler: async (request, h) => {
    const payload = request.payload
    request.server.logger.info('Received payload', payload)
    return h.response({ message: 'Payload received (not saved yet)' }).code(200)
  }
}
