import { createServer } from '../server.js'

describe('/state endpoint', () => {
  let server
  let mockDb, updateOneSpy, findOneSpy, loggerInfoSpy, loggerErrorSpy

  const testPayload = {
    businessId: 'B1',
    userId: 'U1',
    grantId: 'G1',
    grantVersion: 'v1',
    state: { test: 'value' }
  }

  const testQueryParams = 'businessId=B1&userId=U1&grantId=G1&grantVersion=v1'

  beforeEach(async () => {
    updateOneSpy = jest.fn().mockResolvedValue({})
    findOneSpy = jest.fn().mockResolvedValue(null)
    mockDb = {
      collection: () => ({
        updateOne: updateOneSpy,
        findOne: findOneSpy
      })
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
    loggerErrorSpy = jest
      .spyOn(server.logger, 'error')
      .mockImplementation(() => {})
  })

  afterEach(async () => {
    jest.clearAllMocks()
    await server.stop()
  })

  describe('POST /state', () => {
    test('responds 201 and saves state when new document is inserted', async () => {
      updateOneSpy.mockResolvedValue({ upsertedCount: 1 })

      const res = await server.inject({
        method: 'POST',
        url: '/state',
        payload: testPayload
      })

      expect(res.statusCode).toBe(201)
      expect(JSON.parse(res.payload)).toEqual({ success: true, created: true })

      expect(updateOneSpy).toHaveBeenCalledWith(
        { businessId: 'B1', userId: 'U1', grantId: 'G1', grantVersion: 'v1' },
        expect.objectContaining({
          $set: expect.anything(),
          $setOnInsert: expect.anything()
        }),
        { upsert: true }
      )
      expect(loggerInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Received payload of size: 93 bytes')
      )
    })

    test('responds 200 when an existing document is updated', async () => {
      updateOneSpy.mockResolvedValue({ upsertedCount: 0 })

      const res = await server.inject({
        method: 'POST',
        url: '/state',
        payload: testPayload
      })

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload)).toEqual({ success: true, updated: true })
    })

    test('responds 400 on missing required field', async () => {
      const { businessId, ...incompletePayload } = testPayload

      const res = await server.inject({
        method: 'POST',
        url: '/state',
        payload: incompletePayload
      })

      expect(res.statusCode).toBe(400)
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Validation failed:'),
        expect.anything()
      )
    })

    test('responds 400 on extra top-level field', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/state',
        payload: { ...testPayload, extra: 'not allowed' }
      })

      expect(res.statusCode).toBe(400)
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
        payload: testPayload
      })

      expect(res.statusCode).toBe(500)
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to save application state | name=MongoServerSelectionError | message=DB failure | reason="Mock connection timeout" | code=ECONNREFUSED | isMongoError=true | stack=MongoServerSelectionError: DB failure'
        )
      )
    })
  })

  describe('GET /state', () => {
    const mockDocument = {
      _id: 'some-id',
      businessId: 'B1',
      userId: 'U1',
      grantId: 'G1',
      grantVersion: 'v1',
      state: { test: 'value' },
      createdAt: new Date(),
      updatedAt: new Date()
    }

    test('responds 200 and returns state when document exists', async () => {
      findOneSpy.mockResolvedValue(mockDocument)

      const res = await server.inject({
        method: 'GET',
        url: `/state?${testQueryParams}`
      })

      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload)).toEqual({
        test: 'value'
      })

      expect(findOneSpy).toHaveBeenCalledWith({
        businessId: 'B1',
        userId: 'U1',
        grantId: 'G1'
      })
    })

    test('responds 404 when document does not exist', async () => {
      findOneSpy.mockResolvedValue(null)

      const res = await server.inject({
        method: 'GET',
        url: `/state?${testQueryParams}`
      })

      expect(res.statusCode).toBe(404)
      expect(JSON.parse(res.payload)).toEqual({ error: 'State not found' })
    })

    test.each([
      ['userId=U1&grantId=G1&grantVersion=v1', 'businessId missing'],
      ['businessId=B1&grantId=G1&grantVersion=v1', 'userId missing'],
      ['businessId=B1&userId=U1&grantVersion=v1', 'grantId missing'],
      ['', 'all parameters missing']
    ])('responds 400 when %s', async (queryString, _description) => {
      const res = await server.inject({
        method: 'GET',
        url: `/state?${queryString}`
      })

      expect(res.statusCode).toBe(400)
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Validation failed:'),
        expect.anything()
      )
    })

    test('logs error on DB failure', async () => {
      const error = Object.assign(new Error('DB read failure'), {
        name: 'MongoNetworkError',
        code: 'ETIMEDOUT',
        reason: 'Network timeout',
        isMongoError: true
      })
      findOneSpy.mockRejectedValue(error)

      const res = await server.inject({
        method: 'GET',
        url: `/state?${testQueryParams}`
      })

      expect(res.statusCode).toBe(500)
      expect(JSON.parse(res.payload)).toEqual({
        error: 'Failed to retrieve application state'
      })
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to retrieve application state | name=MongoNetworkError | message=DB read failure | reason="Network timeout" | code=ETIMEDOUT | isMongoError=true | stack=MongoNetworkError: DB read failure'
        )
      )
    })
  })
})
