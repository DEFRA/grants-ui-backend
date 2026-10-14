import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { resolveAllowedGrants } from './allowlist.service.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'

export const allowlistGrants = {
  method: 'GET',
  path: '/allowlist/grants',
  options: {
    auth: 'bearer'
  },
  handler: async (request, h) => {
    const { sbi } = request.auth.credentials

    if (!sbi) {
      log(LogCodes.ALLOWLIST.GRANTS_UNAUTHORIZED, { errorMessage: 'sbi missing from token' })
      throw Boom.unauthorized('sbi is required in the x-user-context token')
    }

    const grants = await resolveAllowedGrants(sbi)
    return h.response({ grants }).code(StatusCodes.OK)
  }
}
