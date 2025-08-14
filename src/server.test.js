import {
  TEST_AUTH_TOKEN,
  TEST_ENCRYPTION_KEY,
  HTTP_POST,
  STATE_URL,
  CONTENT_TYPE_HEADER,
  CONTENT_TYPE_JSON,
  AUTH_HEADER,
  HTTP_201_CREATED
} from './test-helpers/auth-constants.js'
import crypto from 'crypto'

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
  let loggerInfoSpy
  let loggerWarnSpy
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

    loggerInfoSpy = jest
      .spyOn(server.logger, 'info')
      .mockImplementation(() => {})
    loggerWarnSpy = jest
      .spyOn(server.logger, 'warn')
      .mockImplementation(() => {})
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
      url: STATE_URL,
      payload: {
        businessId: 'BIZ123',
        userId: 'USER456',
        grantId: 'GRANT789',
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
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('payload of size')
    )

    // Should not warn for small payloads
    expect(loggerWarnSpy).not.toHaveBeenCalled()
  })

  test('logs warning for large payload (handled in route)', async () => {
    const largeObj = { foo: 'x'.repeat(600_000) }

    const response = await server.inject({
      method: HTTP_POST,
      url: STATE_URL,
      payload: {
        businessId: 'BIZ123',
        userId: 'USER456',
        grantId: 'GRANT789',
        grantVersion: 1,
        state: largeObj
      },
      headers: {
        [CONTENT_TYPE_HEADER]: CONTENT_TYPE_JSON,
        [AUTH_HEADER]: authHeader
      }
    })

    expect(response.statusCode).toBe(HTTP_201_CREATED)

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Large payload approaching limit | size=600099 | threshold=500000 | max=1048576 | path=/state | userId=USER456'
      )
    )
  })
})
