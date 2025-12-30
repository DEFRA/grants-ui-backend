import Boom from '@hapi/boom'
import { acquireApplicationLock, refreshApplicationLock } from '../common/helpers/application-lock.js'
import { verifyLockToken } from '../common/helpers/lock/lock-token.js'

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
  const rawToken = request.headers['x-application-lock-owner']
  if (!rawToken) throw Boom.unauthorized('Missing lock token')

  let payload
  try {
    payload = verifyLockToken(rawToken)
  } catch (err) {
    throw Boom.unauthorized('Invalid lock token')
  }

  const { sub: ownerId, sbi, grantCode, grantVersion, typ } = payload

  if (typ !== 'lock') {
    throw Boom.unauthorized('Invalid lock token type')
  }

  if (!sbi) {
    throw Boom.badRequest('Missing SBI in lock token')
  }

  if (!grantCode) {
    throw Boom.badRequest('Missing grant code in lock token')
  }

  const version = Number(grantVersion ?? 1)
  if (Number.isNaN(version)) {
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

  if (!grantCode) {
    throw Boom.badRequest('Missing application identifiers')
  }

  if (!ownerId) {
    throw Boom.unauthorized('Missing user identity')
  }

  const db = request.db

  // 1. Try to acquire lock (or refresh own lock)
  const lock = await acquireApplicationLock(db, {
    grantCode,
    grantVersion,
    sbi,
    ownerId
  })

  if (!lock) {
    // Someone else holds the lock
    throw Boom.locked('Another applicant is currently editing this application')
  }

  // 2. If lock already owned by this user, refresh expiry
  await refreshApplicationLock(db, { grantCode, grantVersion, sbi, ownerId })

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
