import Joi from 'joi'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import { releaseAllApplicationLocksForOwner, releaseApplicationLock } from '../common/helpers/application-lock.js'
import Boom from '@hapi/boom'
import { verifyOwnerLockReleaseToken } from '../common/helpers/lock/lock-token.js'

const applicationLockReleaseSchema = Joi.object({
  sbi: Joi.string().required(),
  ownerId: Joi.string().required(),
  grantCode: Joi.string().required(),
  grantVersion: Joi.string().required()
})

export const applicationLockRelease = {
  method: 'DELETE',
  path: '/admin/application-lock',
  options: {
    auth: 'bearer',
    validate: {
      query: applicationLockReleaseSchema,
      failAction: (request, h, err) => {
        const { sbi, ownerId, grantCode, grantVersion } = request.query

        log(LogCodes.SYSTEM.APPLICATION_LOCK_RELEASE_FAILED, {
          sbi,
          ownerId,
          grantCode,
          grantVersion,
          errorName: err.name,
          errorMessage: `DELETE /admin/application-lock validation failed: ${err.message}`,
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
    const { sbi, ownerId, grantCode, grantVersion } = request.query
    const db = request.db

    try {
      const released = await releaseApplicationLock(db, {
        sbi,
        grantCode,
        grantVersion,
        ownerId
      })

      return h.response({ success: true, released }).code(200)
    } catch (err) {
      return h.response({ error: 'Failed to release application lock' }).code(500)
    }
  }
}

export const applicationLocksRelease = {
  method: 'DELETE',
  path: '/application-locks',
  options: {
    auth: 'bearer'
  },

  handler: async (request, h) => {
    const db = request.db

    const lockToken = request.headers['x-application-lock-release']
    if (!lockToken) {
      throw Boom.unauthorized('Missing lock token')
    }

    const { ownerId } = verifyOwnerLockReleaseToken(lockToken)

    try {
      const deletedCount = await releaseAllApplicationLocksForOwner(db, { ownerId })
      return h.response({ success: true, deletedCount }).code(200)
    } catch (err) {
      return h.response({ error: 'Failed to release application locks' }).code(500)
    }
  }
}
