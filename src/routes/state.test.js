import { createServer } from '../server.js' // or however your server is initialized

describe('POST /state', () => {
  let server
  let mockDb, updateOneSpy, loggerInfoSpy, loggerWarnSpy, loggerErrorSpy

  beforeEach(async () => {
    updateOneSpy = jest.fn().mockResolvedValue({})
    mockDb = {
      collection: () => ({ updateOne: updateOneSpy })
    }

    server = await createServer()
    await server.initialize()
    server.ext('onRequest', (request, h) => {
      request.db = mockDb
      return h.continue
    })

    loggerInfoSpy = jest
      .spyOn(server.logger, 'info')
      .mockImplementation(() => {})
    loggerWarnSpy = jest
      .spyOn(server.logger, 'warn')
      .mockImplementation(() => {})
    loggerErrorSpy = jest
      .spyOn(server.logger, 'error')
      .mockImplementation(() => {})
  })

  afterEach(async () => {
    jest.clearAllMocks()
    await server.stop()
  })

  test('responds 200 and saves state', async () => {
    const payload = {
      businessId: 'B1',
      userId: 'U1',
      grantId: 'G1',
      grantVersion: 'v1',
      state: { test: 'value' },
      relevantState: { nested: true }
    }

    const res = await server.inject({
      method: 'POST',
      url: '/state',
      payload
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ success: true })

    expect(updateOneSpy).toHaveBeenCalledWith(
      { businessId: 'B1', userId: 'U1', grantId: 'G1', grantVersion: 'v1' },
      expect.objectContaining({
        $set: expect.anything(),
        $setOnInsert: expect.anything()
      }),
      { upsert: true }
    )
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('Received payload of size: 125 bytes')
    )
  })

  test('responds 400 on missing required field', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/state',
      payload: {
        // businessId missing
        userId: 'U1',
        grantId: 'G1',
        grantVersion: 'v1',
        state: {},
        relevantState: {}
      }
    })

    expect(res.statusCode).toBe(400)
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Validation failed:'),
      expect.anything()
    )
  })

  test('responds 400 on extra top-level field', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/state',
      payload: {
        businessId: 'B1',
        userId: 'U1',
        grantId: 'G1',
        grantVersion: 'v1',
        state: {},
        relevantState: {},
        extra: 'not allowed'
      }
    })

    expect(res.statusCode).toBe(400)
  })

  test('logs warning for large payloads', async () => {
    const largeState = { data: 'x'.repeat(600_000) }

    await server.inject({
      method: 'POST',
      url: '/state',
      payload: {
        businessId: 'B1',
        userId: 'U1',
        grantId: 'G1',
        grantVersion: 'v1',
        state: largeState,
        relevantState: {}
      }
    })

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Large payload detected'),
      expect.objectContaining({ userId: 'U1' })
    )
  })

  test('logs error on DB failure', async () => {
    const error = Object.assign(new Error('DB failure'), {
      name: 'MongoServerSelectionError',
      code: 'ECONNREFUSED',
      reason: 'Mock connection timeout',
      isMongoError: true
    })
    updateOneSpy.mockRejectedValue(error)

    const res = await server.inject({
      method: 'POST',
      url: '/state',
      payload: {
        businessId: 'B1',
        userId: 'U1',
        grantId: 'G1',
        grantVersion: 'v1',
        state: {},
        relevantState: {}
      }
    })

    expect(res.statusCode).toBe(500)
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to save application state | name=MongoServerSelectionError | message=DB failure | reason="Mock connection timeout" | code=ECONNREFUSED | isMongoError=true | stack=MongoServerSelectionError: DB failure'
      )
    )
  })
})
