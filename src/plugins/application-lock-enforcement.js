import Boom from '@hapi/boom'
import { acquireApplicationLock, refreshApplicationLock } from '../common/helpers/application-lock.js'
import { verifyLockToken } from '../common/helpers/lock/lock-token.js'

/**
 * Extracts the owner and grant identifiers from the application lock token header.
 *
 * This function reads the 'x-application-lock-owner' header, verifies the JWT,
 * and returns the owner ID and grant code. It does not access the request body,
 * query parameters, or path.
 *
 * @param {Object} request - Hapi request object
 * @param {Object} request.headers - Request headers
 * @throws {Boom.unauthorized} If the header is missing or the token is invalid
 * @returns {Object} An object containing:
 *   - ownerId: string, the user who owns the lock
 *   - grantCode: string, the grant application code
 *   - grantVersion: number, defaults to 1
 */
function extractLockKeys(request) {
  const rawToken = request.headers['x-application-lock-owner']
  if (!rawToken) throw Boom.unauthorized('Missing lock token')

  let payload
  try {
    payload = verifyLockToken(rawToken)
  } catch (err) {
    throw Boom.unauthorized('Invalid lock token')
  }

  const ownerId = payload.sub
  const grantCode = payload.grantCode

  return {
    ownerId,
    grantCode,
    grantVersion: 1
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
  const { ownerId, grantCode, grantVersion } = extractLockKeys(request)

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
    ownerId
  })

  if (!lock) {
    // Someone else holds the lock
    throw Boom.locked('Another applicant is currently editing this application')
  }

  // 2. If lock already owned by this user, refresh expiry
  await refreshApplicationLock(db, { grantCode, grantVersion, ownerId })

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
