import Boom from '@hapi/boom'
import { acquireOrRefreshApplicationLock } from '../common/helpers/application-lock.js'
import { verifyLockToken } from '../common/helpers/lock/lock-token.js'
import { LogCodes } from '../common/helpers/logging/log-codes.js'
import { log } from '../common/helpers/logging/log.js'

/**
 * Extracts lock-scoping identifiers from the application lock token header.
 *
 * This function reads the 'x-application-lock-owner' header, verifies the JWT,
 * and derives the lock owner and scope identifiers (SBI and grant details).
 *
 * @param {Object} request - Hapi request object
 * @param {Object} request.headers - Request headers
 * @throws {Boom.unauthorized} If the header is missing or the token is invalid,
 *   or the token type is incorrect
 * @throws {Boom.badRequest} If required lock-scoping claims are missing
 * @returns {Object} An object containing:
 *   - ownerId {string} User identifier owning the lock (JWT `sub`)
 *   - sbi {string} Single Business Identifier defining the lock scope
 *   - grantCode {string} Grant application code
 *   - grantVersion {number} Grant scheme version
 */
export function extractLockKeys(request) {
  const path = request.path
  const method = request.method.toUpperCase()
  const rawToken = request.headers['x-application-lock-owner']
  if (!rawToken) {
    log(LogCodes.APPLICATION_LOCK.LOCK_TOKEN_MISSING, { path, method })
    throw Boom.unauthorized('Missing lock token')
  }

  let payload
  try {
    payload = verifyLockToken(rawToken)
  } catch (err) {
    log(LogCodes.APPLICATION_LOCK.LOCK_TOKEN_INVALID, {
      path,
      method,
      errorName: err.name,
      errorMessage: err.message
    })
    throw Boom.unauthorized('Invalid lock token')
  }

  const { sub: ownerId, sbi, grantCode, grantVersion, typ } = payload

  if (typ !== 'lock') {
    log(LogCodes.APPLICATION_LOCK.LOCK_TOKEN_WRONG_TYPE, {
      path,
      method,
      typ
    })
    throw Boom.unauthorized('Invalid lock token type')
  }

  if (!ownerId) {
    log(LogCodes.APPLICATION_LOCK.LOCK_TOKEN_MISSING_USER_IDENTITY, {
      path,
      method,
      userId: ownerId
    })
    throw Boom.unauthorized('Missing user identity')
  }

  if (!sbi) {
    log(LogCodes.APPLICATION_LOCK.LOCK_TOKEN_MISSING_SBI, {
      path,
      method,
      sbi
    })
    throw Boom.badRequest('Missing SBI in lock token')
  }

  if (!grantCode) {
    log(LogCodes.APPLICATION_LOCK.LOCK_TOKEN_MISSING_GRANT_CODE, {
      path,
      method,
      grantCode
    })
    throw Boom.badRequest('Missing grant code in lock token')
  }

  const version = Number(grantVersion ?? 1)
  if (Number.isNaN(version)) {
    log(LogCodes.APPLICATION_LOCK.LOCK_TOKEN_INVALID_VERSION, {
      path,
      method,
      grantVersion
    })
    throw Boom.badRequest('Invalid grantVersion in lock token')
  }

  return {
    ownerId,
    sbi,
    grantCode,
    grantVersion: version
  }
}

/**
 * Hapi pre-handler that enforces exclusive edit access to a grant application.
 *
 * Attempts to acquire or refresh an application edit lock for the
 * authenticated user. If another user holds an active lock, the request
 * is rejected with HTTP 423 (Locked).
 *
 * Routes opt into this behaviour with:
 *   options.pre = [{ method: enforceApplicationLock }]
 *
 * @param {import('@hapi/hapi').Request} request
 * @param {import('@hapi/hapi').ResponseToolkit} h
 * @returns {Promise<symbol>} Resolves with h.continue
 */
export async function enforceApplicationLock(request, h) {
  const { ownerId, sbi, grantCode, grantVersion } = extractLockKeys(request)

  const db = request.db

  const lock = await acquireOrRefreshApplicationLock(db, {
    grantCode,
    grantVersion,
    sbi,
    ownerId
  })

  if (!lock) {
    log(LogCodes.APPLICATION_LOCK.LOCK_CONFLICT, {
      path: request.path,
      method: request.method,
      sbi,
      grantCode,
      ownerId
    })
    throw Boom.locked('Another applicant is currently editing this application')
  }

  return h.continue
}

export const applicationLockPlugin = {
  name: 'applicationLock',
  version: '1.0.0',
  register: async function (server) {
    // Register as a server method so routes can use it easily
    server.method('enforceApplicationLock', enforceApplicationLock)
  }
}
