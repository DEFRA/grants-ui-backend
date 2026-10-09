import Boom from '@hapi/boom'
import Joi from 'joi'
import { resolveLatestVersion } from './config.service.js'

export const latestDefinition = {
  method: 'GET',
  path: '/definitions/{grantCode}',
  options: {
    auth: 'bearer',
    validate: { params: Joi.object({ grantCode: Joi.string().required() }) }
  },
  handler: async (request) => {
    const definition = await resolveLatestVersion(request.params.grantCode)
    if (!definition) {
      throw Boom.notFound('Form definition not found')
    }
    return definition
  }
}
