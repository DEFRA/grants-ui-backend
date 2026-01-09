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
