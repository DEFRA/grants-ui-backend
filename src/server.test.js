import { TEST_AUTH_TOKEN, TEST_ENCRYPTION_KEY } from './test-helpers/auth-constants.js'
import {
  HTTP_POST,
  HTTP_DELETE,
  CONTENT_TYPE_HEADER,
  CONTENT_TYPE_JSON,
  AUTH_HEADER,
  HTTP_201_CREATED
} from './test-helpers/http-header-constants.js'
import crypto from 'crypto'
import { log, LogCodes } from '~/src/common/helpers/logging/log.js'

// Mock log
jest.mock('~/src/common/helpers/logging/log.js', () => ({
  log: jest.fn(),
  LogCodes: {
    STATE: {
      STATE_PAYLOAD_SIZE: { level: 'info', messageFunc: jest.fn() },
      STATE_PAYLOAD_SIZE_FAILED: { level: 'error', messageFunc: jest.fn() }
    },
    AUTH: {
      TOKEN_VERIFICATION_SUCCESS: { level: 'info', messageFunc: jest.fn() },
      TOKEN_VERIFICATION_FAILURE: { level: 'error', messageFunc: jest.fn() }
    }
  }
}))

const encryptToken = (token, encryptionKey) => {
  const iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(encryptionKey, 'salt', 32)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  let encrypted = cipher.update(token, 'utf8', 'base64')
  encrypted += cipher.final('base64')

  const authTag = cipher.getAuthTag()

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
}

describe('POST /state payload size logging', () => {
  let server
  let authHeader

  beforeAll(async () => {
    process.env.GRANTS_UI_BACKEND_AUTH_TOKEN = TEST_AUTH_TOKEN
    process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY

    const { createServer } = await import('./server.js')
    server = await createServer()
    await server.initialize()

    const encryptedToken = encryptToken(TEST_AUTH_TOKEN, TEST_ENCRYPTION_KEY)
    const credentials = ':' + encryptedToken
    authHeader = `Basic ${Buffer.from(credentials).toString('base64')}`
  })

  afterEach(async () => {
    const { MongoClient } = await import('mongodb')
    const client = new MongoClient(process.env.MONGO_URI)
    await client.connect()
    const db = client.db('grants-ui-backend')
    await db.collection('grant-application-state').deleteMany({})
    await client.close()
  })

  afterAll(async () => {
    await server.stop()
    jest.restoreAllMocks()
  })

  test('logs payload size info for small payload (handled in route)', async () => {
    const response = await server.inject({
      method: HTTP_POST,
      url: '/state',
      payload: {
        sbi: 'BIZ123',
        grantCode: 'GRANT789',
        grantVersion: 1,
        state: { a: 'small' }
      },
      headers: {
        [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
        [AUTH_HEADER]: authHeader
      }
    })

    expect(response.statusCode).toBe(HTTP_201_CREATED)

    // Look for size log
    expect(log).toHaveBeenCalledWith(
      LogCodes.STATE.STATE_PAYLOAD_SIZE,
      expect.objectContaining({ payloadSize: expect.any(Number) })
    )

    // Should not warn for small payloads
    expect(log).not.toHaveBeenCalledWith(LogCodes.STATE.STATE_PAYLOAD_SIZE_WARNING, expect.any(Object))
  })

  test('DELETE endpoint requires authentication', async () => {
    const response = await server.inject({
      method: HTTP_DELETE,
      url: '/state?sbi=BIZ123&grantCode=GRANT789',
      headers: {
        [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON
      }
    })

    expect(response.statusCode).toBe(401)
    expect(response.result.message).toBe('Invalid authentication credentials')
  })

  test('logs warning for large payload (handled in route)', async () => {
    const largeObj = { foo: 'x'.repeat(600_000) }

    const response = await server.inject({
      method: HTTP_POST,
      url: '/state',
      payload: {
        sbi: 'BIZ123',
        grantCode: 'GRANT789',
        grantVersion: 1,
        state: largeObj
      },
      headers: {
        [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
        [AUTH_HEADER]: authHeader
      }
    })

    expect(response.statusCode).toBe(HTTP_201_CREATED)

    expect(log).toHaveBeenNthCalledWith(
      3,
      LogCodes.STATE.STATE_PAYLOAD_SIZE_FAILED,
      expect.objectContaining({
        payloadSize: expect.any(Number),
        threshold: 500_000,
        max: 1_048_576,
        path: '/state'
      })
    )
  })
})
