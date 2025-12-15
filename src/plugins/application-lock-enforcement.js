// src/plugins/application-lock.js
import Boom from '@hapi/boom'
import { acquireApplicationLock, refreshApplicationLock } from '../common/helpers/application-lock.js'

/**
 * Extracts lock identifiers from request.
 * Adjust this when real route parameters are known.
 */
function extractLockKeys(request) {
  const { grantCode, sbi } = request.params
  return { grantCode, grantVersion: Number(request.params.grantVersion), sbi }
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
 * @returns {Promise<symbol>} h.continue
 */
export async function enforceApplicationLock(request, h) {
  const { grantCode, grantVersion, sbi } = extractLockKeys(request)

  // DefraID user identity (auth plugin already sets credentials)
  const ownerId = request.auth?.credentials?.contactId
  if (!ownerId) {
    // This should not happen normally; safeguard anyway
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
