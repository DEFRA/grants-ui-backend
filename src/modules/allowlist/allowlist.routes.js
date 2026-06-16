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
    const { crn, sbi } = request.auth.credentials

    if (!crn || !sbi) {
      log(LogCodes.ALLOWLIST.GRANTS_BAD_REQUEST, { errorMessage: 'crn and sbi missing from token' })
      throw Boom.unauthorized('crn and sbi are required in the x-encrypted-auth token')
    }

    const grants = await resolveAllowedGrants(crn, sbi)
    return h.response({ grants }).code(StatusCodes.OK)
  }
}
