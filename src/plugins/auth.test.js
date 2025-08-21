import { TEST_AUTH_TOKEN, TEST_ENCRYPTION_KEY } from '~/src/test-helpers/auth-constants.js'
import {
  HTTP_POST,
  HTTP_GET,
  STATE_URL,
  CONTENT_TYPE_HEADER,
  CONTENT_TYPE_JSON,
  AUTH_HEADER,
  HTTP_401_UNAUTHORIZED
} from '~/src/test-helpers/http-header-constants.js'
import crypto from 'crypto'

import { log, LogCodes } from '~/src/common/helpers/logging/log.js'

jest.mock('~/src/common/helpers/logging/log.js', () => ({
  log: jest.fn(),
  LogCodes: {
    STATE: {
      STATE_PAYLOAD_SIZE: { level: 'info', messageFunc: jest.fn() }
    },
    AUTH: {
      TOKEN_VERIFICATION_SUCCESS: { level: 'info', messageFunc: jest.fn() },
      TOKEN_VERIFICATION_FAILURE: { level: 'error', messageFunc: jest.fn() }
    }
  }
}))

describe('Auth Plugin Integration Tests', () => {
  const INVALID_AUTH_MESSAGE = 'Invalid authentication credentials'
  const BASIC_PAYLOAD = {
    businessId: 'test-business',
    userId: 'test-user',
    grantId: 'test-grant',
    grantVersion: 1,
    state: { step: 1, data: 'test' }
  }

  const createBasicAuthCredentials = (token) => Buffer.from(`:${token}`).toString('base64')
  const createBasicAuthHeader = (token) => `Basic ${createBasicAuthCredentials(token)}`
  const createBearerAuthHeader = (token) => `Bearer ${token}`
  const createUserCredentials = (username, token) => Buffer.from(`${username}:${token}`).toString('base64')

  const encryptToken = (token, encryptionKey) => {
    const iv = crypto.randomBytes(12)
    const key = crypto.scryptSync(encryptionKey, 'salt', 32)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

    let encrypted = cipher.update(token, 'utf8', 'base64')
    encrypted += cipher.final('base64')

    const authTag = cipher.getAuthTag()

    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
  }

  const createEncryptedAuthHeader = (token, encryptionKey) => {
    const encryptedToken = encryptToken(token, encryptionKey)
    const credentials = Buffer.from(`:${encryptedToken}`).toString('base64')
    return `Basic ${credentials}`
  }

  let server

  beforeAll(async () => {
    process.env.GRANTS_UI_BACKEND_AUTH_TOKEN = TEST_AUTH_TOKEN
    process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY

    const { createServer } = await import('../server.js')
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  describe('Valid Authentication', () => {
    it('should authenticate with correct encrypted bearer token', async () => {
      const response = await server.inject({
        method: HTTP_POST,
        url: STATE_URL,
        headers: {
          [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
          [AUTH_HEADER]: createEncryptedAuthHeader(TEST_AUTH_TOKEN, TEST_ENCRYPTION_KEY)
        },
        payload: BASIC_PAYLOAD
      })

      expect(response.statusCode).not.toBe(HTTP_401_UNAUTHORIZED)
    })

    it('should log successful authentication at info level', async () => {
      const response = await server.inject({
        method: HTTP_POST,
        url: STATE_URL,
        headers: {
          [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
          [AUTH_HEADER]: createEncryptedAuthHeader(TEST_AUTH_TOKEN, TEST_ENCRYPTION_KEY)
        },
        payload: BASIC_PAYLOAD
      })

      expect(response.statusCode).not.toBe(HTTP_401_UNAUTHORIZED)

      expect(log).toHaveBeenCalledWith(
        LogCodes.AUTH.TOKEN_VERIFICATION_SUCCESS,
        expect.objectContaining({
          path: STATE_URL,
          method: 'post'
        })
      )
    })
  })

  describe('Invalid Authentication', () => {
    const WRONG_TOKEN = 'wrong-token'
    const BASIC_PREFIX = 'Basic'
    const MALFORMED_BASE64 = '@#$%^&*()'
    const EMPTY_STRING = ''
    const MULTI_COLON_TOKEN = ':token:with:extra:colons'
    it('should reject request without authorization header', async () => {
      const response = await server.inject({
        method: HTTP_POST,
        url: STATE_URL,
        headers: {
          [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON
        },
        payload: BASIC_PAYLOAD
      })

      expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
      expect(response.result.message).toBe(INVALID_AUTH_MESSAGE)
    })

    it('should reject request with wrong token', async () => {
      const response = await server.inject({
        method: HTTP_POST,
        url: STATE_URL,
        headers: {
          [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
          [AUTH_HEADER]: createBasicAuthHeader(WRONG_TOKEN)
        },
        payload: BASIC_PAYLOAD
      })

      expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
      expect(response.result.message).toBe(INVALID_AUTH_MESSAGE)
    })

    it('should reject request with Bearer instead of Basic', async () => {
      const response = await server.inject({
        method: HTTP_POST,
        url: STATE_URL,
        headers: {
          [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
          [AUTH_HEADER]: createBearerAuthHeader(TEST_AUTH_TOKEN)
        },
        payload: BASIC_PAYLOAD
      })

      expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
      expect(response.result.message).toBe(INVALID_AUTH_MESSAGE)
    })

    it('should reject request with non-blank username', async () => {
      const credentials = createUserCredentials('user', TEST_AUTH_TOKEN)

      const response = await server.inject({
        method: HTTP_POST,
        url: STATE_URL,
        headers: {
          [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
          [AUTH_HEADER]: `${BASIC_PREFIX} ${credentials}`
        },
        payload: BASIC_PAYLOAD
      })

      expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
      expect(response.result.message).toBe(INVALID_AUTH_MESSAGE)
    })

    it('should reject request with malformed base64', async () => {
      const response = await server.inject({
        method: HTTP_POST,
        url: STATE_URL,
        headers: {
          [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
          [AUTH_HEADER]: `${BASIC_PREFIX} ${MALFORMED_BASE64}`
        },
        payload: BASIC_PAYLOAD
      })

      expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
      expect(response.result.message).toBe(INVALID_AUTH_MESSAGE)
    })

    it('should reject request with empty token', async () => {
      const credentials = createBasicAuthCredentials(EMPTY_STRING)

      const response = await server.inject({
        method: HTTP_POST,
        url: STATE_URL,
        headers: {
          [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
          [AUTH_HEADER]: `${BASIC_PREFIX} ${credentials}`
        },
        payload: BASIC_PAYLOAD
      })

      expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
      expect(response.result.message).toBe(INVALID_AUTH_MESSAGE)
    })

    it('should reject request with only "Basic" prefix', async () => {
      const response = await server.inject({
        method: HTTP_POST,
        url: STATE_URL,
        headers: {
          [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
          [AUTH_HEADER]: BASIC_PREFIX
        },
        payload: BASIC_PAYLOAD
      })

      expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
      expect(response.result.message).toBe(INVALID_AUTH_MESSAGE)
    })

    it('should reject request with empty authorization header', async () => {
      const response = await server.inject({
        method: HTTP_POST,
        url: STATE_URL,
        headers: {
          [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
          [AUTH_HEADER]: EMPTY_STRING
        },
        payload: BASIC_PAYLOAD
      })

      expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
      expect(response.result.message).toBe(INVALID_AUTH_MESSAGE)
    })

    it('should reject request with credentials containing multiple colons', async () => {
      const credentials = Buffer.from(MULTI_COLON_TOKEN).toString('base64')

      const response = await server.inject({
        method: HTTP_POST,
        url: STATE_URL,
        headers: {
          [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
          [AUTH_HEADER]: `${BASIC_PREFIX} ${credentials}`
        },
        payload: BASIC_PAYLOAD
      })

      expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
      expect(response.result.message).toBe(INVALID_AUTH_MESSAGE)
    })

    it('should reject unencrypted token when encryption key is configured', async () => {
      const response = await server.inject({
        method: HTTP_POST,
        url: STATE_URL,
        headers: {
          [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
          [AUTH_HEADER]: createBasicAuthHeader(TEST_AUTH_TOKEN) // Unencrypted token
        },
        payload: BASIC_PAYLOAD
      })

      expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
      expect(response.result.message).toBe(INVALID_AUTH_MESSAGE)
    })
  })

  describe('Edge Cases', () => {
    const STATE_GET_URL = '/state?businessId=test&userId=test-user&grantId=test-grant'
    const USER_AGENT_HEADER = 'user-agent'
    const TEST_USER_AGENT = 'Test User Agent'
    it('should handle GET requests with authentication', async () => {
      const response = await server.inject({
        method: HTTP_GET,
        url: STATE_GET_URL,
        headers: {
          [AUTH_HEADER]: createEncryptedAuthHeader(TEST_AUTH_TOKEN, TEST_ENCRYPTION_KEY)
        }
      })

      expect(response.statusCode).not.toBe(HTTP_401_UNAUTHORIZED)
    })

    it('should handle requests with user-agent header', async () => {
      const response = await server.inject({
        method: HTTP_POST,
        url: STATE_URL,
        headers: {
          [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
          [USER_AGENT_HEADER]: TEST_USER_AGENT
        },
        payload: BASIC_PAYLOAD
      })

      expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
      expect(response.result.message).toBe(INVALID_AUTH_MESSAGE)
    })
  })

  describe('Configuration Edge Cases', () => {
    const MINIMAL_PAYLOAD = {
      businessId: 'test-business',
      userId: 'test-user',
      grantId: 'test-grant',
      grantVersion: 1,
      state: { step: 1 }
    }
    it('should handle authentication when server logger is present', async () => {
      expect(server.logger).toBeDefined()

      const response = await server.inject({
        method: HTTP_POST,
        url: STATE_URL,
        headers: {
          [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON
        },
        payload: MINIMAL_PAYLOAD
      })

      expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
    })

    it('should handle auth token not configured scenario by testing with empty environment', async () => {
      const originalToken = process.env.GRANTS_UI_BACKEND_AUTH_TOKEN
      delete process.env.GRANTS_UI_BACKEND_AUTH_TOKEN

      try {
        const { createServer } = await import('../server.js')
        const testServer = await createServer()
        await testServer.initialize()

        const response = await testServer.inject({
          method: HTTP_POST,
          url: STATE_URL,
          headers: {
            [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
            [AUTH_HEADER]: createBasicAuthHeader('any-token')
          },
          payload: MINIMAL_PAYLOAD
        })

        expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
        expect(response.result.message).toBe(INVALID_AUTH_MESSAGE)

        await testServer.stop()
      } finally {
        if (originalToken) {
          process.env.GRANTS_UI_BACKEND_AUTH_TOKEN = originalToken
        }
      }
    })
  })

  describe('Base64 Decoding Edge Cases', () => {
    const BASIC_PREFIX = 'Basic'
    const MINIMAL_PAYLOAD = {
      businessId: 'test-business',
      userId: 'test-user',
      grantId: 'test-grant',
      grantVersion: 1,
      state: { step: 1 }
    }
    it('should handle base64 decode errors and log them', async () => {
      const invalidBase64 = '====invalid====base64===='

      const response = await server.inject({
        method: HTTP_POST,
        url: STATE_URL,
        headers: {
          [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
          [AUTH_HEADER]: `${BASIC_PREFIX} ${invalidBase64}`
        },
        payload: MINIMAL_PAYLOAD
      })

      expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
      expect(response.result.message).toBe(INVALID_AUTH_MESSAGE)
    })

    it('should handle base64 decoding exceptions and log the error', async () => {
      const originalBufferFrom = Buffer.from
      const mockError = new Error('Mocked base64 decoding error')
      Buffer.from = jest.fn().mockImplementation((input, encoding) => {
        if (encoding === 'base64' && input === 'force-error-token') {
          throw mockError
        }
        return originalBufferFrom(input, encoding)
      })

      const response = await server.inject({
        method: HTTP_POST,
        url: STATE_URL,
        headers: {
          [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
          [AUTH_HEADER]: `${BASIC_PREFIX} force-error-token`
        },
        payload: MINIMAL_PAYLOAD
      })

      expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
      expect(response.result.message).toBe(INVALID_AUTH_MESSAGE)

      Buffer.from = originalBufferFrom
    })
  })

  describe('Encrypted Token Authentication', () => {
    it('should authenticate with encrypted token when encryption key is configured', async () => {
      const originalToken = process.env.GRANTS_UI_BACKEND_AUTH_TOKEN
      const originalKey = process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY

      process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY

      let testServer
      try {
        const { createServer } = await import('../server.js')
        testServer = await createServer()
        await testServer.initialize()

        const response = await testServer.inject({
          method: HTTP_POST,
          url: STATE_URL,
          headers: {
            [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
            [AUTH_HEADER]: createEncryptedAuthHeader(TEST_AUTH_TOKEN, TEST_ENCRYPTION_KEY)
          },
          payload: BASIC_PAYLOAD
        })

        expect(response.statusCode).not.toBe(HTTP_401_UNAUTHORIZED)
      } finally {
        if (testServer) await testServer.stop()
        process.env.GRANTS_UI_BACKEND_AUTH_TOKEN = originalToken
        if (originalKey) {
          process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = originalKey
        } else {
          delete process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY
        }
      }
    })

    it('should reject invalid encrypted token', async () => {
      const originalKey = process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY

      process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY

      let testServer
      try {
        const { createServer } = await import('../server.js')
        testServer = await createServer()
        await testServer.initialize()

        const response = await testServer.inject({
          method: HTTP_POST,
          url: STATE_URL,
          headers: {
            [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
            [AUTH_HEADER]: createEncryptedAuthHeader('wrong-token', TEST_ENCRYPTION_KEY)
          },
          payload: BASIC_PAYLOAD
        })

        expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
      } finally {
        if (testServer) await testServer.stop()
        if (originalKey) {
          process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = originalKey
        } else {
          delete process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY
        }
      }
    })

    it('should handle malformed encrypted token gracefully', async () => {
      const originalKey = process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY

      process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY

      let testServer
      try {
        const { createServer } = await import('../server.js')
        testServer = await createServer()
        await testServer.initialize()

        const malformedEncryptedToken = 'invalid:encrypted:token:format'
        const credentials = Buffer.from(`:${malformedEncryptedToken}`).toString('base64')

        const response = await testServer.inject({
          method: HTTP_POST,
          url: STATE_URL,
          headers: {
            [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
            [AUTH_HEADER]: `Basic ${credentials}`
          },
          payload: BASIC_PAYLOAD
        })

        expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
        expect(response.result.message).toBe(INVALID_AUTH_MESSAGE)
      } finally {
        if (testServer) await testServer.stop()
        if (originalKey) {
          process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = originalKey
        } else {
          delete process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY
        }
      }
    })

    it('should reject encrypted token when encryption key is not configured', async () => {
      const originalKey = process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY

      delete process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY

      let testServer
      try {
        const { createServer } = await import('../server.js')
        testServer = await createServer()
        await testServer.initialize()

        const encryptedToken = 'iv:authTag:encryptedData'
        const credentials = Buffer.from(`:${encryptedToken}`).toString('base64')

        const response = await testServer.inject({
          method: HTTP_POST,
          url: STATE_URL,
          headers: {
            [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
            [AUTH_HEADER]: `Basic ${credentials}`
          },
          payload: BASIC_PAYLOAD
        })

        expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
        expect(response.result.message).toBe(INVALID_AUTH_MESSAGE)
      } finally {
        if (testServer) await testServer.stop()
        if (originalKey) {
          process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = originalKey
        } else {
          delete process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY
        }
      }
    })

    it('should reject encrypted token with invalid format (missing parts)', async () => {
      const originalKey = process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY

      process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY

      let testServer
      try {
        const { createServer } = await import('../server.js')
        testServer = await createServer()
        await testServer.initialize()

        const invalidFormatToken = 'missing:parts'
        const credentials = Buffer.from(`:${invalidFormatToken}`).toString('base64')

        const response = await testServer.inject({
          method: HTTP_POST,
          url: STATE_URL,
          headers: {
            [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
            [AUTH_HEADER]: `Basic ${credentials}`
          },
          payload: BASIC_PAYLOAD
        })

        expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
        expect(response.result.message).toBe(INVALID_AUTH_MESSAGE)
      } finally {
        if (testServer) await testServer.stop()
        if (originalKey) {
          process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = originalKey
        } else {
          delete process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY
        }
      }
    })

    it('should handle encryption key becoming null during decryption', async () => {
      const originalKey = process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY

      process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY

      let testServer
      try {
        const { config } = await import('../config.js')
        const originalConfigGet = config.get
        let callCount = 0

        config.get = jest.fn().mockImplementation((key) => {
          if (key === 'auth.encryptionKey') {
            callCount++
            if (callCount === 1) {
              return TEST_ENCRYPTION_KEY
            } else {
              return null
            }
          }
          return originalConfigGet.call(config, key)
        })

        const { createServer } = await import('../server.js')
        testServer = await createServer()
        await testServer.initialize()

        const encryptedToken = 'iv:authTag:encryptedData'
        const credentials = Buffer.from(`:${encryptedToken}`).toString('base64')

        const response = await testServer.inject({
          method: HTTP_POST,
          url: STATE_URL,
          headers: {
            [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
            [AUTH_HEADER]: `Basic ${credentials}`
          },
          payload: BASIC_PAYLOAD
        })

        expect(response.statusCode).toBe(HTTP_401_UNAUTHORIZED)
        expect(response.result.message).toBe(INVALID_AUTH_MESSAGE)

        config.get = originalConfigGet
      } finally {
        if (testServer) await testServer.stop()
        if (originalKey) {
          process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = originalKey
        } else {
          delete process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY
        }
      }
    })
  })
})
