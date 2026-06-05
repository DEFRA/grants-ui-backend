import { stateDelete, statePatch, stateRetrieve, stateSave } from './state.routes.js'
import { logIfApproachingPayloadLimit } from '~/src/common/helpers/logging/log-if-approaching-payload-limit.js'
import { log, LogCodes } from '~/src/common/helpers/logging/log.js'
import { enforceApplicationLock } from './lock-enforcement.js'
import {
  saveApplicationState,
  getApplicationState,
  deleteApplicationState,
  patchApplicationState
} from './state.service.js'

jest.mock('./state.service.js', () => ({
  saveApplicationState: jest.fn(),
  getApplicationState: jest.fn(),
  deleteApplicationState: jest.fn(),
  patchApplicationState: jest.fn()
}))

jest.mock('~/src/common/helpers/logging/log-if-approaching-payload-limit.js', () => ({
  logIfApproachingPayloadLimit: jest.fn()
}))
jest.mock('~/src/common/helpers/logging/log.js', () => {
  const { LogCodes } = jest.requireActual('~/src/common/helpers/logging/log-codes.js')
  return { log: jest.fn(), LogCodes }
})

describe('State', () => {
  const defaultQuery = {
    sbi: 'business123',
    grantCode: 'grant123',
    grantVersion: '1.0.0'
  }

  let mockServer
  let mockRequest
  let mockH

  beforeEach(() => {
    jest.clearAllMocks()

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
      server: mockServer
    }
  })

  describe('state routes lock enforcement', () => {
    test('stateSave route is protected by application lock', () => {
      expect(stateSave.options.pre).toBeDefined()
      expect(stateSave.options.pre[0].method).toBe(enforceApplicationLock)
    })

    test('stateRetrieve route is protected by application lock', () => {
      expect(stateRetrieve.options.pre[0].method).toBe(enforceApplicationLock)
    })

    test('stateDelete route is protected by application lock', () => {
      expect(stateDelete.options.pre[0].method).toBe(enforceApplicationLock)
    })

    test('statePatch route is protected by application lock', () => {
      expect(statePatch.options.pre[0].method).toBe(enforceApplicationLock)
    })
  })

  describe('statePatch', () => {
    const defaultParams = {
      sbi: 'business123',
      grantCode: 'grant123',
      grantVersion: '1.0.0'
    }

    test('should patch applicationStatus and return 200', async () => {
      mockRequest.params = defaultParams
      mockRequest.payload = { state: { applicationStatus: 'IN_PROGRESS' } }
      patchApplicationState.mockResolvedValue({ _id: 'some-id', state: { applicationStatus: 'IN_PROGRESS' } })

      await statePatch.handler(mockRequest, mockH)

      expect(patchApplicationState).toHaveBeenCalledWith({ ...defaultParams, applicationStatus: 'IN_PROGRESS' })
      expect(mockH.response).toHaveBeenCalledWith({ success: true, patched: true })
      expect(mockH.code).toHaveBeenCalledWith(200)
    })

    test('should return 404 when no document is found to patch', async () => {
      mockRequest.params = defaultParams
      mockRequest.payload = { state: { applicationStatus: 'IN_PROGRESS' } }
      patchApplicationState.mockResolvedValue(null)

      await statePatch.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith({ error: 'State not found' })
      expect(mockH.code).toHaveBeenCalledWith(404)
    })

    test('should handle database errors and return 500', async () => {
      mockRequest.params = defaultParams
      mockRequest.payload = { state: { applicationStatus: 'IN_PROGRESS' } }

      const dbError = new Error('Database error')
      dbError.name = 'MongoError'
      dbError.code = 500
      dbError.reason = 'Some reason'
      patchApplicationState.mockRejectedValue(dbError)

      await statePatch.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith({ error: 'Failed to patch application state' })
      expect(mockH.code).toHaveBeenCalledWith(500)
    })

    test('should validate params and throw error for invalid data', () => {
      const invalidParams = { grantCode: 'grant123' }

      const mockValidationRequest = {
        server: mockServer,
        params: invalidParams
      }

      const mockError = new Error('Validation error')
      mockError.name = 'ValidationError'
      mockError.code = 400
      mockError.reason = 'Some reason'

      expect(() => statePatch.options.validate.failAction(mockValidationRequest, mockH, mockError)).toThrow(
        'Validation error'
      )
      expect(log).toHaveBeenCalledWith(
        LogCodes.STATE.STATE_PATCH_FAILED,
        expect.objectContaining({
          sbi: invalidParams.sbi,
          grantCode: invalidParams.grantCode,
          errorName: mockError.name,
          errorMessage: `PATCH /state, validation failed: ${mockError.message}`,
          errorReason: mockError.reason,
          errorCode: mockError.code,
          isMongoError: false,
          stack: expect.stringContaining('ValidationError: Validation error')
        })
      )
    })
  })

  describe('stateSave', () => {
    test('should create a new state document and return 201', async () => {
      mockRequest.payload = {
        ...defaultQuery,
        grantVersion: '2',
        state: { key: 'value' }
      }
      saveApplicationState.mockResolvedValue({ upsertedCount: 1 })

      await stateSave.handler(mockRequest, mockH)

      expect(saveApplicationState).toHaveBeenCalledWith({
        sbi: defaultQuery.sbi,
        grantCode: defaultQuery.grantCode,
        grantVersion: '2',
        state: { key: 'value' }
      })
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
      saveApplicationState.mockResolvedValue({ upsertedCount: 0, modifiedCount: 1 })

      await stateSave.handler(mockRequest, mockH)

      expect(saveApplicationState).toHaveBeenCalledWith({
        sbi: defaultQuery.sbi,
        grantCode: defaultQuery.grantCode,
        grantVersion: '2',
        state: { key: 'updated-value' }
      })
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
      dbError.code = 500
      dbError.reason = 'Some reason'
      dbError.name = 'MongoError'
      saveApplicationState.mockRejectedValue(dbError)

      await stateSave.handler(mockRequest, mockH)

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
      mockError.name = 'ValidationError'
      mockError.code = 404
      mockError.reason = 'Some reason'

      expect(() => stateSave.options.validate.failAction(mockValidationRequest, mockH, mockError)).toThrow(
        'Validation error'
      )
      expect(log).toHaveBeenCalledWith(
        LogCodes.STATE.STATE_SAVE_FAILED,
        expect.objectContaining({
          sbi: invalidPayload.sbi,
          grantCode: invalidPayload.grantCode,
          grantVersion: invalidPayload.grantVersion,
          errorName: mockError.name,
          errorMessage: `POST /state, validation failed: ${mockError.message}`,
          errorReason: mockError.reason,
          errorCode: mockError.code,
          isMongoError: false,
          stack: expect.stringContaining('ValidationError: Validation error')
        })
      )
    })
  })

  describe('stateRetrieve', () => {
    test('should retrieve state document and return 200', async () => {
      const mockDocument = { grantVersion: '1.0.0', sbi: 'business123', grantCode: 'grant123', state: { key: 'value' } }
      getApplicationState.mockResolvedValue(mockDocument)
      mockRequest.query = defaultQuery

      await stateRetrieve.handler(mockRequest, mockH)

      expect(getApplicationState).toHaveBeenCalledWith(defaultQuery)
      expect(mockH.response).toHaveBeenCalledWith(mockDocument)
      expect(mockH.code).toHaveBeenCalledWith(200)
    })

    test('should return 404 when state document is not found', async () => {
      mockRequest.query = defaultQuery
      getApplicationState.mockResolvedValue(null)

      await stateRetrieve.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith({ error: 'State not found' })
      expect(mockH.code).toHaveBeenCalledWith(404)
    })

    test('should handle database errors and return 500', async () => {
      mockRequest.query = defaultQuery
      const dbError = new Error('Database error')
      dbError.name = 'MongoError'
      dbError.code = 500
      dbError.reason = 'Some reason'
      getApplicationState.mockRejectedValue(dbError)

      await stateRetrieve.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Failed to retrieve application state'
      })
      expect(mockH.code).toHaveBeenCalledWith(500)
    })

    test('should validate query and throw error for invalid data', () => {
      const invalidQuery = {
        // Missing required fields
        grantCode: 'grant123'
      }

      const mockValidationRequest = {
        server: mockServer,
        query: invalidQuery
      }

      const mockError = new Error('Validation error')
      mockError.name = 'ValidationError'
      mockError.code = 404
      mockError.reason = 'Some reason'

      expect(() => stateRetrieve.options.validate.failAction(mockValidationRequest, mockH, mockError)).toThrow(
        'Validation error'
      )
      expect(log).toHaveBeenCalledWith(
        LogCodes.STATE.STATE_RETRIEVE_FAILED,
        expect.objectContaining({
          sbi: invalidQuery.sbi,
          grantCode: invalidQuery.grantCode,
          errorName: mockError.name,
          errorMessage: `GET /state, validation failed: ${mockError.message}`,
          errorReason: mockError.reason,
          errorCode: mockError.code,
          isMongoError: false,
          stack: expect.stringContaining('ValidationError: Validation error')
        })
      )
    })
  })

  describe('stateDelete', () => {
    test('should delete state document and return 200', async () => {
      mockRequest.query = defaultQuery
      deleteApplicationState.mockResolvedValue({ _id: 'some-id', grantVersion: '1.0.0' })

      await stateDelete.handler(mockRequest, mockH)

      expect(deleteApplicationState).toHaveBeenCalledWith(defaultQuery)
      expect(mockH.response).toHaveBeenCalledWith({
        success: true,
        deleted: true
      })
      expect(mockH.code).toHaveBeenCalledWith(200)
    })

    test('should return 404 when no document is found to delete', async () => {
      mockRequest.query = defaultQuery
      deleteApplicationState.mockResolvedValue(null)

      await stateDelete.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith({ error: 'State not found' })
      expect(mockH.code).toHaveBeenCalledWith(404)
    })

    test('should handle database errors and return 500', async () => {
      mockRequest.query = defaultQuery

      const dbError = new Error('Database error')
      dbError.name = 'MongoError'
      dbError.code = 500
      dbError.reason = 'Some reason'

      deleteApplicationState.mockRejectedValue(dbError)

      await stateDelete.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Failed to delete application state'
      })
      expect(mockH.code).toHaveBeenCalledWith(500)
    })

    test('should validate query and throw error for invalid data', () => {
      const invalidQuery = {
        // Missing required fields
        grantCode: 'grant123'
      }

      const mockValidationRequest = {
        server: mockServer,
        query: invalidQuery
      }

      const mockError = new Error('Validation error')
      mockError.name = 'ValidationError'
      mockError.code = 404
      mockError.reason = 'Some reason'

      expect(() => stateDelete.options.validate.failAction(mockValidationRequest, mockH, mockError)).toThrow(
        'Validation error'
      )
      expect(log).toHaveBeenCalledWith(
        LogCodes.STATE.STATE_DELETE_FAILED,
        expect.objectContaining({
          sbi: invalidQuery.sbi,
          grantCode: invalidQuery.grantCode,
          errorName: mockError.name,
          errorMessage: `DELETE /state, validation failed: ${mockError.message}`,
          errorReason: mockError.reason,
          errorCode: mockError.code,
          isMongoError: false,
          stack: expect.stringContaining('ValidationError: Validation error')
        })
      )
    })
  })
})
