import Boom from '@hapi/boom'
import Joi from 'joi'
import { resolveLatestVersion, resolveLatestVersionWithinMajor } from './config.service.js'

/**
 * The latest active definition of a grant: the latest overall, or the latest within `major` when given.
 * An application is pinned to its major, so a caller that needs the definition an existing application
 * is served under, without opening it, asks for that major.
 */
export const latestDefinition = {
  method: 'GET',
  path: '/definitions/{grantCode}',
  options: {
    auth: 'bearer',
    validate: {
      params: Joi.object({ grantCode: Joi.string().required() }),
      query: Joi.object({ major: Joi.number().integer().min(0).optional() })
    }
  },
  handler: async (request) => {
    const { grantCode } = request.params
    const { major } = request.query
    const definition =
      major === undefined
        ? await resolveLatestVersion(grantCode)
        : await resolveLatestVersionWithinMajor(grantCode, major)
    if (!definition) {
      throw Boom.notFound('Form definition not found')
    }
    return definition
  }
}
