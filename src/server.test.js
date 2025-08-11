import { createServer } from './server.js'

describe('POST /state payload size logging', () => {
  let server
  let loggerInfoSpy
  let loggerWarnSpy

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()

    // Spy on server logger
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
      method: 'POST',
      url: '/state',
      payload: {
        businessId: 'BIZ123',
        userId: 'USER456',
        grantId: 'GRANT789',
        grantVersion: 1,
        state: { a: 'small' }
      },
      headers: {
        'Content-Type': 'application/json'
      }
    })

    expect(response.statusCode).toBe(201)

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
      method: 'POST',
      url: '/state',
      payload: {
        businessId: 'BIZ123',
        userId: 'USER456',
        grantId: 'GRANT789',
        grantVersion: 1,
        state: largeObj
      }
    })

    expect(response.statusCode).toBe(201)

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Large payload approaching limit | size=600099 | threshold=500000 | max=1048576 | path=/state | userId=USER456'
      )
    )
  })
})
