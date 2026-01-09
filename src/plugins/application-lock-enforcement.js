import Boom from '@hapi/boom'
import { acquireOrRefreshApplicationLock } from '../common/helpers/application-lock.js'
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

  if (!ownerId) {
    throw Boom.unauthorized('Missing user identity')
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
 * Returns true if the application has already been submitted.
 *
 * A submitted application must:
 * - NOT acquire or refresh locks
 * - Be viewable by other users in the same SBI
 * - Be immutable (no further state writes)
 *
 * @param {import('mongodb').Db} db
 * @param {Object} params
 * @param {string} params.sbi
 * @param {string} params.grantCode
 * @param {number} params.grantVersion
 * @returns {Promise<boolean>}
 */
export async function hasApplicationBeenSubmitted(db, { sbi, grantCode, grantVersion }) {
  const submission = await db.collection('grant_application_submissions').findOne(
    {
      sbi,
      grantCode,
      grantVersion
    },
    {
      projection: { _id: 1 }
    }
  )

  return Boolean(submission)
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

  const isSubmitted = await hasApplicationBeenSubmitted(db, {
    sbi,
    grantCode,
    grantVersion
  })

  if (isSubmitted && request.method.toLowerCase() !== 'get') {
    throw Boom.forbidden('Application has already been submitted')
  }

  if (isSubmitted) {
    return h.continue
  }

  const lock = await acquireOrRefreshApplicationLock(db, {
    grantCode,
    grantVersion,
    sbi,
    ownerId
  })

  if (!lock) {
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
