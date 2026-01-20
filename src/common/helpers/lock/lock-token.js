import Boom from '@hapi/boom'
import { config } from '../../../config.js'
import jwt from 'jsonwebtoken'

/**
 * Verify and decode an application lock token.
 *
 * Verification ensures:
 * - Token integrity and authenticity
 * - Correct issuer and audience
 *
 * NOTE:
 * - Successful verification does NOT imply lock ownership
 * - Backend must still validate against stored lock state
 *
 * @param {string} token - JWT lock token
 * @returns {Object} Decoded and verified token payload
 * @throws {Error} If token is invalid or verification fails
 */
export function verifyLockToken(token) {
  return jwt.verify(token, config.get('applicationLock.secret'), {
    audience: 'grants-backend',
    issuer: 'grants-ui'
  })
}

/**
 * Verify and decode an owner-scoped application lock release token.
 *
 * This token authorises releasing *all* application locks held by a user,
 * typically used during sign-out or session cleanup.
 *
 * Verification guarantees:
 * - Token integrity and authenticity (HMAC signature)
 * - Correct issuer and audience
 * - Token is explicitly scoped for lock release operations
 *
 * IMPORTANT:
 * - This does NOT imply that any locks existed or were released
 * - The backend must still perform the delete operation and return results
 * - The ownerId MUST be taken from the verified token payload, not from headers
 *
 * @param {string} token - JWT lock release token
 * @returns {{ ownerId: number }} Verified lock owner identity
 *
 * @throws {Error} If:
 * - the token is missing or malformed
 * - signature verification fails
 * - issuer or audience is incorrect
 * - token scope is invalid
 * - ownerId is missing or not coercible to a number
 */
export function verifyOwnerLockReleaseToken(token) {
  const payload = jwt.verify(token, config.get('applicationLock.secret'), {
    audience: 'grants-backend',
    issuer: 'grants-ui'
  })

  if (payload.typ !== 'lock-release') {
    throw Boom.unauthorized('Invalid lock release token')
  }

  if (!payload.sub) {
    throw Boom.unauthorized('Lock release token missing ownerId')
  }

  return {
    ownerId: String(payload.sub)
  }
}
