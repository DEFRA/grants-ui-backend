import Boom from '@hapi/boom'
import Joi from 'joi'
import { resolveLatestVersion, resolveLatestVersionWithinMajor } from './config.service.js'

/**
 * `major` narrows the result to the latest active definition within that major: the one an existing
 * application, pinned to its major, is served under.
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
