import Boom from '@hapi/boom'
import crypto from 'crypto'
import { config } from '../config.js'
import { createLogger } from '../common/helpers/logging/logger.js'

const logger = createLogger()

/**
 * Decrypts an encrypted bearer token using AES-256-GCM
 * @param {string} encryptedToken - Token in format: iv:authTag:encryptedData (base64)
 * @returns {string} Decrypted token
 */
function decryptToken(encryptedToken) {
  const encryptionKey = config.get('auth.encryptionKey')
  if (!encryptionKey) {
    throw new Error('Encryption key not configured')
  }

  try {
    const [ivB64, authTagB64, encryptedData] = encryptedToken.split(':')
    if (!ivB64 || !authTagB64 || !encryptedData) {
      throw new Error('Invalid encrypted token format')
    }

    const iv = Buffer.from(ivB64, 'base64')
    const authTag = Buffer.from(authTagB64, 'base64')
    const key = crypto.scryptSync(encryptionKey, 'salt', 32)

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encryptedData, 'base64', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  } catch (error) {
    logger.error(error, 'Token decryption failed')
    throw new Error('Failed to decrypt token')
  }
}

function validateBasicAuth(authHeader) {
  if (!authHeader?.startsWith('Basic ')) {
    return {
      isValid: false,
      error: 'Missing or invalid Authorization header format'
    }
  }

  const token = authHeader.slice(6)
  let decodedAuth

  try {
    decodedAuth = Buffer.from(token, 'base64').toString('utf-8')
  } catch (error) {
    logger.error(error, 'Base64 decoding failed during authentication')
    return {
      isValid: false,
      error: 'Invalid base64 encoding in Authorization header'
    }
  }

  const colonIndex = decodedAuth.indexOf(':')
  const username = colonIndex === -1 ? decodedAuth : decodedAuth.substring(0, colonIndex)
  const password = colonIndex === -1 ? '' : decodedAuth.substring(colonIndex + 1)

  if (username !== '') {
    return {
      isValid: false,
      error: 'Username must be blank for service authentication'
    }
  }

  if (!password) {
    return { isValid: false, error: 'Bearer token (password) is required' }
  }

  const expectedToken = config.get('auth.token')
  if (!expectedToken) {
    logger.error('Server auth token not configured')
    return {
      isValid: false,
      error: 'Server authentication token not configured'
    }
  }

  const encryptionKey = config.get('auth.encryptionKey')
  if (!encryptionKey) {
    logger.error('Encryption key not configured - encrypted tokens are required')
    return { isValid: false, error: 'Server encryption not configured' }
  }

  let actualToken
  try {
    actualToken = decryptToken(password)
  } catch (error) {
    logger.error(error, 'Token decryption failed during authentication')
    return { isValid: false, error: 'Invalid encrypted token' }
  }

  const tokensMatch = actualToken === expectedToken

  if (!tokensMatch) {
    return { isValid: false, error: 'Invalid bearer token' }
  }

  return { isValid: true }
}

const auth = {
  plugin: {
    name: 'auth',
    register: (server, _options) => {
      server.auth.scheme('bearer-basic', (server, options) => {
        return {
          authenticate: (request, h) => {
            const authHeader = request.headers.authorization

            const validation = validateBasicAuth(authHeader)

            if (!validation.isValid) {
              throw Boom.unauthorized('Invalid authentication credentials')
            }

            request.server.logger.info('Authentication successful', {
              path: request.path,
              method: request.method
            })

            return h.authenticated({ credentials: { authenticated: true } })
          }
        }
      })

      server.auth.strategy('bearer-basic-auth', 'bearer-basic')
    }
  }
}

export { auth }
