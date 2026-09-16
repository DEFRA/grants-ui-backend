import Boom from '@hapi/boom'
import Jwt from '@hapi/jwt'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'

const EXPECTED_TOKEN_PARTS = 3
/**
 * Decrypts an encrypted bearer token using AES-256-GCM
 * @param {string} encryptedToken - Token in format: iv:authTag:encryptedData (base64)
 * @returns {string} Decrypted token
 */
function decryptToken(encryptedToken) {
  const encryptionKey = config.get('auth.encryptionKey')
  if (!encryptionKey) {
    return null
  }

  try {
    const parts = encryptedToken.split(':')
    if (parts.length !== EXPECTED_TOKEN_PARTS) {
      throw new Error('Malformed encrypted token')
    }

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
  } catch {
    return null
  }
}

function validateAuthToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      isValid: false,
      error: 'Missing or invalid Authorization header format'
    }
  }

  const expectedToken = config.get('auth.token')
  if (!expectedToken) {
    return {
      isValid: false,
      error: 'Server authentication token not configured'
    }
  }

  const encryptionKey = config.get('auth.encryptionKey')
  if (!encryptionKey) {
    return { isValid: false, error: 'Server encryption not configured' }
  }

  try {
    const encryptedToken = Buffer.from(authHeader.split(' ').pop(), 'base64').toString('utf-8')
    const actualToken = decryptToken(encryptedToken)
    if (!actualToken) {
      return { isValid: false, error: 'Invalid encrypted token' }
    }

    const tokensMatch = actualToken === expectedToken

    if (!tokensMatch) {
      return { isValid: false, error: 'Invalid bearer token' }
    }
  } catch (error) {
    return { isValid: false, error: `Invalid encrypted token - ${error.message}` }
  }

  return { isValid: true }
}

/**
 * Verifies an x-user-context JWT and returns its claims.
 * Returns an empty object if the token is absent, the secret is missing,
 * or verification fails.
 *
 * @param {string|undefined} userContext
 * @param {string} jwtSecret
 * @returns {Record<string, unknown>}
 */
export function decodeUserContextHeader(userContext, jwtSecret) {
  if (!userContext) {
    return {}
  }

  if (!jwtSecret) {
    log(LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE, {
      errorName: 'JWT secret not configured',
      errorMessage: 'Cannot decode x-user-context header — JWT secret is missing'
    })
    return {}
  }

  try {
    return jwt.verify(userContext, jwtSecret)
  } catch (err) {
    log(LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE, {
      errorName: err.name,
      errorMessage: err.message,
      stack: err.stack
    })
    return {}
  }
}

/**
 * Verifies a CDP service-to-service Web Identity JWT (issued via AWS STS,
 * no stored secret) against the CDP-provided JWKS endpoint. Locally, floci
 * has no GetWebIdentityToken support so callers send a MockProvider token
 * instead of a real JWT - accept any Bearer token as-is rather than trying
 * (and failing) to verify it against a JWKS endpoint.
 * @param {import('@hapi/hapi').Server} server
 * @param {import('@hapi/hapi').Request} request
 * @returns {Promise<{serviceName: string} | null>}
 */
async function validateServiceJwt(server, request) {
  if (!config.get('serviceAuth.enabled')) {
    return null
  }

  if (config.get('cdpEnvironment') === 'local') {
    return { serviceName: 'local' }
  }

  try {
    const { credentials } = await server.auth.test('service-jwt', request)
    return credentials
  } catch (error) {
    log(LogCodes.AUTH.SERVICE_JWT_REJECTED, { reason: error.message })
    return null
  }
}

const auth = {
  plugin: {
    name: 'auth',
    register: async (server, _options) => {
      await server.register(Jwt)

      const isLocalEnvironment = config.get('cdpEnvironment') === 'local'

      if (config.get('serviceAuth.enabled') && !isLocalEnvironment) {
        const allowedServices = config
          .get('serviceAuth.allowedServices')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)

        server.auth.strategy('service-jwt', 'jwt', {
          keys: { uri: config.get('serviceAuth.jwksUri') },
          verify: {
            aud: config.get('serviceAuth.audience'),
            iss: config.get('serviceAuth.issuer'),
            sub: false
          },
          validate: (artifacts) => {
            const sub = artifacts.decoded.payload.sub
            if (!sub) {
              log(LogCodes.AUTH.SERVICE_JWT_REJECTED, { reason: 'missing sub claim' })
              return { isValid: false }
            }

            const serviceName = sub.split('/').pop()
            if (allowedServices.length > 0 && !allowedServices.includes(serviceName)) {
              log(LogCodes.AUTH.SERVICE_JWT_REJECTED, { reason: 'service not in allowed list' })
              return { isValid: false }
            }

            return { isValid: true, credentials: { serviceName } }
          }
        })
      }

      server.auth.scheme('bearer', (_server, _opts) => {
        return {
          authenticate: async (request, h) => {
            const authHeader = request.headers.authorization

            const legacyValidation = validateAuthToken(authHeader)
            const shouldTryServiceJwt = !legacyValidation.isValid && authHeader?.startsWith('Bearer ')
            const serviceCredentials = shouldTryServiceJwt ? await validateServiceJwt(server, request) : null

            if (!legacyValidation.isValid && !serviceCredentials) {
              log(LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE, {
                errorName: 'Invalid authentication credentials',
                errorMessage: legacyValidation.error
              })
              throw Boom.unauthorized('Invalid authentication credentials')
            }

            log(LogCodes.AUTH.TOKEN_VERIFICATION_SUCCESS, {
              path: request.path,
              method: request.method,
              authMethod: serviceCredentials ? 'web_identity' : 'shared_token'
            })

            const jwtSecret = config.get('encryptedAuthJwtSecret')
            const payload = decodeUserContextHeader(request.headers['x-user-context'], jwtSecret)
            const crn =
              typeof payload.crn === 'string' || typeof payload.crn === 'number' ? `${payload.crn}` : undefined
            const sbi =
              typeof payload.sbi === 'string' || typeof payload.sbi === 'number' ? `${payload.sbi}` : undefined
            return h.authenticated({
              credentials: { authenticated: true, crn, sbi, serviceName: serviceCredentials?.serviceName }
            })
          }
        }
      })

      server.auth.strategy('bearer', 'bearer')
    }
  }
}

export { auth }
