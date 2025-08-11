import { MongoClient } from 'mongodb'
import { stateDelete, stateRetrieve, stateSave } from './state.js'
import { logIfApproachingPayloadLimit } from '../common/helpers/logging/log-if-approaching-payload-limit.js'

jest.mock(
  '../common/helpers/logging/log-if-approaching-payload-limit.js',
  () => ({
    logIfApproachingPayloadLimit: jest.fn()
  })
)

describe('State', () => {
  const defaultQuery = {
    businessId: 'business123',
    userId: 'user123',
    grantId: 'grant123'
  }

  let connection
  let db
  let mockCollection
  let mockServer
  let mockRequest
  let mockH

  beforeAll(async () => {
    connection = await MongoClient.connect(process.env.MONGO_URI)
    db = await connection.db()
  })

  afterAll(async () => {
    await connection.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()

    mockCollection = {
      updateOne: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      deleteOne: jest.fn()
    }

    db.collection = jest.fn().mockReturnValue(mockCollection)

    mockServer = {
      logger: {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
      }
    }

    mockH = {
      response: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis()
    }

    mockRequest = {
      server: mockServer,
      db
    }
  })

  describe('stateSave', () => {
    test('should create a new state document and return 201', async () => {
      mockRequest.payload = {
        ...defaultQuery,
        grantVersion: '2',
        state: { key: 'value' }
      }
      mockCollection.updateOne.mockResolvedValue({ upsertedCount: 1 })

      await stateSave.handler(mockRequest, mockH)

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        {
          ...defaultQuery,
          grantVersion: '2'
        },
        expect.objectContaining({
          $set: expect.objectContaining({
            state: { key: 'value' }
          })
        }),
        { upsert: true }
      )
      expect(mockH.response).toHaveBeenCalledWith({
        success: true,
        created: true
      })
      expect(mockH.code).toHaveBeenCalledWith(201)
      expect(logIfApproachingPayloadLimit).toHaveBeenCalled()
    })

    test('should update an existing state document and return 200', async () => {
      mockRequest.payload = {
        ...defaultQuery,
        grantVersion: '2',
        state: { key: 'updated-value' }
      }
      mockCollection.updateOne.mockResolvedValue({
        upsertedCount: 0,
        modifiedCount: 1
      })

      await stateSave.handler(mockRequest, mockH)

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        {
          ...defaultQuery,
          grantVersion: '2'
        },
        expect.objectContaining({
          $set: expect.objectContaining({
            state: { key: 'updated-value' }
          })
        }),
        { upsert: true }
      )
      expect(mockH.response).toHaveBeenCalledWith({
        success: true,
        updated: true
      })
      expect(mockH.code).toHaveBeenCalledWith(200)
    })

    test('should handle database errors and return 500', async () => {
      mockRequest.payload = {
        ...defaultQuery,
        grantVersion: '2',
        state: { key: 'value' }
      }
      const dbError = new Error('Database error')
      dbError.name = 'MongoError'
      mockCollection.updateOne.mockRejectedValue(dbError)

      await stateSave.handler(mockRequest, mockH)

      expect(mockServer.logger.error).toHaveBeenCalled()
      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Failed to save application state'
      })
      expect(mockH.code).toHaveBeenCalledWith(500)
    })

    test('should validate payload and throw error for invalid data', () => {
      const invalidPayload = {
        // Missing required fields
        state: { key: 'value' }
      }

      const mockValidationRequest = {
        server: mockServer,
        payload: invalidPayload
      }

      const mockError = new Error('Validation error')

      expect(() =>
        stateSave.options.validate.failAction(
          mockValidationRequest,
          mockH,
          mockError
        )
      ).toThrow('Validation error')
      expect(mockServer.logger.error).toHaveBeenCalled()
    })
  })

  describe('stateRetrieve', () => {
    test('should retrieve state document and return 200', async () => {
      const mockCursor = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        next: jest.fn().mockResolvedValue({ state: { key: 'value' } })
      }
      mockCollection.find.mockReturnValue(mockCursor)
      mockRequest.query = defaultQuery

      const cursor = mockCollection.find()
      cursor.next.mockResolvedValue({ state: { key: 'value' } })

      await stateRetrieve.handler(mockRequest, mockH)

      expect(mockCollection.find).toHaveBeenCalledWith(defaultQuery)
      expect(mockCursor.sort).toHaveBeenCalledWith({ grantVersion: -1 })
      expect(mockCursor.limit).toHaveBeenCalledWith(1)
      expect(mockCursor.next).toHaveBeenCalled()

      expect(mockH.response).toHaveBeenCalledWith({ key: 'value' })
      expect(mockH.code).toHaveBeenCalledWith(200)
    })

    test('should return 404 when state document is not found', async () => {
      mockRequest.query = defaultQuery
      const mockCursor = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        next: jest.fn().mockResolvedValue(null) // no doc found
      }
      mockCollection.find.mockReturnValue(mockCursor)

      await stateRetrieve.handler(mockRequest, mockH)

      expect(mockCollection.find).toHaveBeenCalledWith(defaultQuery)
      expect(mockCursor.sort).toHaveBeenCalledWith({ grantVersion: -1 })
      expect(mockCursor.limit).toHaveBeenCalledWith(1)
      expect(mockCursor.next).toHaveBeenCalled()

      expect(mockH.response).toHaveBeenCalledWith({ error: 'State not found' })
      expect(mockH.code).toHaveBeenCalledWith(404)
    })

    test('should handle database errors and return 500', async () => {
      mockRequest.query = defaultQuery
      const dbError = new Error('Database error')
      dbError.name = 'MongoError'
      mockCollection.findOne.mockRejectedValue(dbError)

      await stateRetrieve.handler(mockRequest, mockH)

      expect(mockServer.logger.error).toHaveBeenCalled()
      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Failed to retrieve application state'
      })
      expect(mockH.code).toHaveBeenCalledWith(500)
    })

    test('should validate query and throw error for invalid data', () => {
      const invalidQuery = {
        // Missing required fields
        grantId: 'grant123'
      }

      const mockValidationRequest = {
        server: mockServer,
        query: invalidQuery
      }

      const mockError = new Error('Validation error')

      expect(() =>
        stateRetrieve.options.validate.failAction(
          mockValidationRequest,
          mockH,
          mockError
        )
      ).toThrow('Validation error')
      expect(mockServer.logger.error).toHaveBeenCalled()
    })
  })

  describe('stateDelete', () => {
    test('should delete state document and return 200', async () => {
      mockRequest.query = defaultQuery

      const mockCursor = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        next: jest.fn().mockResolvedValue({ _id: 'some-id', grantVersion: 2 })
      }
      mockCollection.find.mockReturnValue(mockCursor)
      mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 })

      await stateDelete.handler(mockRequest, mockH)

      expect(mockCollection.find).toHaveBeenCalledWith(defaultQuery)
      expect(mockCursor.sort).toHaveBeenCalledWith({ grantVersion: -1 })
      expect(mockCursor.limit).toHaveBeenCalledWith(1)
      expect(mockCursor.next).toHaveBeenCalled()

      expect(mockCollection.deleteOne).toHaveBeenCalledWith({ _id: 'some-id' })

      expect(mockH.response).toHaveBeenCalledWith({
        success: true,
        deleted: true
      })
      expect(mockH.code).toHaveBeenCalledWith(200)
    })

    test('should return 404 when no document is found to delete', async () => {
      mockRequest.query = defaultQuery

      const mockCursor = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        next: jest.fn().mockResolvedValue(null)
      }
      mockCollection.find.mockReturnValue(mockCursor)

      await stateDelete.handler(mockRequest, mockH)

      expect(mockCollection.find).toHaveBeenCalledWith(defaultQuery)
      expect(mockCursor.sort).toHaveBeenCalledWith({ grantVersion: -1 })
      expect(mockCursor.limit).toHaveBeenCalledWith(1)
      expect(mockCursor.next).toHaveBeenCalled()

      expect(mockCollection.deleteOne).not.toHaveBeenCalled()

      expect(mockH.response).toHaveBeenCalledWith({ error: 'State not found' })
      expect(mockH.code).toHaveBeenCalledWith(404)
    })

    test('should handle database errors and return 500', async () => {
      mockRequest.query = defaultQuery
      const dbError = new Error('Database error')
      dbError.name = 'MongoError'
      mockCollection.deleteOne.mockRejectedValue(dbError)

      await stateDelete.handler(mockRequest, mockH)

      expect(mockServer.logger.error).toHaveBeenCalled()
      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Failed to delete application state'
      })
      expect(mockH.code).toHaveBeenCalledWith(500)
    })

    test('should validate query and throw error for invalid data', () => {
      const invalidQuery = {
        // Missing required fields
        grantId: 'grant123'
      }

      const mockValidationRequest = {
        server: mockServer,
        query: invalidQuery
      }

      const mockError = new Error('Validation error')

      expect(() =>
        stateDelete.options.validate.failAction(
          mockValidationRequest,
          mockH,
          mockError
        )
      ).toThrow('Validation error')
      expect(mockServer.logger.error).toHaveBeenCalled()
    })
  })
})
