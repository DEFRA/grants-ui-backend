import Boom from '@hapi/boom'
import { addSubmission, retrieveSubmissions } from './submissions.routes.js'

import { releaseApplicationLock, insertSubmission, findSubmissions } from './state.service.js'
import { extractLockKeys } from './lock-enforcement.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'
import { expect } from '@jest/globals'

jest.mock('./state.service.js', () => ({
  releaseApplicationLock: jest.fn(),
  insertSubmission: jest.fn(),
  findSubmissions: jest.fn()
}))
jest.mock('./lock-enforcement.js')
jest.mock('../../common/helpers/logging/log.js')

describe('addSubmission', () => {
  let mockRequest
  let mockH

  const validPayload = {
    crn: '123',
    sbi: '456',
    grantCode: 'example-grant',
    grantVersion: '1.0.0',
    referenceNumber: 'REF-123',
    previousReferenceNumber: 'OLD-REF',
    submittedAt: new Date()
  }

  beforeEach(() => {
    insertSubmission.mockResolvedValue({ acknowledged: true })

    extractLockKeys.mockReturnValue({
      ownerId: 'user1',
      sbi: '456',
      grantCode: 'example-grant',
      grantVersion: '1.0.0'
    })

    mockRequest = {
      payload: validPayload
    }

    mockH = {
      response: jest.fn().mockReturnValue({
        code: jest.fn()
      })
    }

    jest.clearAllMocks()
  })

  it('should insert submission and release lock', async () => {
    insertSubmission.mockResolvedValue({ acknowledged: true })
    extractLockKeys.mockReturnValue({ ownerId: 'user1', sbi: '456', grantCode: 'example-grant', grantVersion: '1.0.0' })

    await addSubmission.handler(mockRequest, mockH)

    expect(insertSubmission).toHaveBeenCalledWith(validPayload)
    expect(releaseApplicationLock).toHaveBeenCalledWith({
      grantCode: 'example-grant',
      grantVersion: '1.0.0',
      sbi: '456',
      ownerId: 'user1'
    })

    expect(mockH.response).toHaveBeenCalledWith({ success: true, created: true })
  })

  it('should insert submission and release lock when grantVersion is an integer', async () => {
    mockRequest = { payload: { ...validPayload, grantVersion: 1 } }
    insertSubmission.mockResolvedValue({ acknowledged: true })
    extractLockKeys.mockReturnValue({
      ownerId: 'user1',
      sbi: '456',
      grantCode: 'example-grant',
      grantVersion: 1
    })

    await addSubmission.handler(mockRequest, mockH)

    expect(releaseApplicationLock).toHaveBeenCalledWith({
      grantCode: 'example-grant',
      grantVersion: 1,
      sbi: '456',
      ownerId: 'user1'
    })

    expect(mockH.response).toHaveBeenCalledWith({ success: true, created: true })
  })

  it('should not throw when grantVersion is integer in payload and string in token (same value)', async () => {
    mockRequest.payload = { ...validPayload, grantVersion: 1 }
    extractLockKeys.mockReturnValue({
      ownerId: 'user1',
      sbi: '456',
      grantCode: 'example-grant',
      grantVersion: '1'
    })

    await addSubmission.handler(mockRequest, mockH)

    expect(mockH.response).toHaveBeenCalledWith({ success: true, created: true })
  })

  it('should throw if SBI does not match lock token', async () => {
    extractLockKeys.mockReturnValue({
      ownerId: 'user1',
      sbi: '999',
      grantCode: 'example-grant',
      grantVersion: '1.0.0'
    })

    await expect(addSubmission.handler(mockRequest, mockH)).rejects.toThrow(
      Boom.badRequest('SBI in payload does not match lock token')
    )
  })

  it('should throw if grant version does not match lock token', async () => {
    extractLockKeys.mockReturnValue({
      ownerId: 'user1',
      sbi: '456',
      grantCode: 'example-grant',
      grantVersion: '2.0.0'
    })

    await expect(addSubmission.handler(mockRequest, mockH)).rejects.toThrow(
      Boom.badRequest('Grant version in payload does not match lock token')
    )
  })

  it('should return 500 if Mongo insert fails', async () => {
    insertSubmission.mockRejectedValue(new Error('Mongo fail'))
    extractLockKeys.mockReturnValue({ ownerId: 'user1', sbi: '456', grantCode: 'example-grant', grantVersion: '1.0.0' })

    await addSubmission.handler(mockRequest, mockH)

    expect(log).toHaveBeenCalled()
    expect(mockH.response).toHaveBeenCalledWith({ error: 'Failed to add submission' })
  })

  it('should log and throw if submission schema invalid', async () => {
    const invalidRequest = {
      ...mockRequest,
      extra_field_not_allowed: 'invalid'
    }
    const mockError = new Error('Validation failed')
    expect(() => addSubmission.options.validate.failAction(invalidRequest, mockH, mockError)).toThrow(
      'Validation failed'
    )

    expect(log).toHaveBeenCalledWith(
      LogCodes.SUBMISSIONS.SUBMISSIONS_ADD_FAILED,
      expect.objectContaining({
        errorName: mockError.name,
        errorMessage: expect.stringContaining('POST /submissions, validation failed: Validation failed')
      })
    )
    expect(mockH.response).not.toHaveBeenCalled()
  })
})

describe('retrieveSubmissions', () => {
  let mockRequest
  let mockH

  beforeEach(() => {
    findSubmissions.mockResolvedValue([{ ref: '1' }])

    mockRequest = {
      query: {
        sbi: '456',
        grantCode: 'example-grant',
        grantVersion: '1.0.0'
      }
    }

    mockH = {
      response: jest.fn().mockReturnValue({
        code: jest.fn()
      })
    }

    jest.clearAllMocks()
  })

  it('should retrieve submissions sorted by submittedAt desc', async () => {
    findSubmissions.mockResolvedValue([{ ref: '1' }])

    await retrieveSubmissions.handler(mockRequest, mockH)

    expect(findSubmissions).toHaveBeenCalledWith(expect.objectContaining({ sbi: '456', grantCode: 'example-grant' }))
    expect(mockH.response).toHaveBeenCalledWith([{ ref: '1' }])
  })

  it('should retrieve submissions when grantVersion is an integer', async () => {
    mockRequest.query = { ...mockRequest.query, grantVersion: 1 }
    findSubmissions.mockResolvedValue([{ ref: '1' }])

    await retrieveSubmissions.handler(mockRequest, mockH)

    expect(mockH.response).toHaveBeenCalledWith([{ ref: '1' }])
  })

  it('should return 500 on Mongo failure', async () => {
    findSubmissions.mockRejectedValue(new Error('Mongo fail'))

    await retrieveSubmissions.handler(mockRequest, mockH)

    expect(log).toHaveBeenCalled()
    expect(mockH.response).toHaveBeenCalledWith({ error: 'Failed to retrieve submissions' })
  })

  it('should log and throw if retrieve submission schema invalid', async () => {
    const invalidRequest = {
      ...mockRequest
    }
    delete invalidRequest.query.sbi
    const mockError = new Error('Validation failed')
    expect(() => retrieveSubmissions.options.validate.failAction(invalidRequest, mockH, mockError)).toThrow(
      'Validation failed'
    )

    expect(log).toHaveBeenCalledWith(
      LogCodes.SUBMISSIONS.SUBMISSIONS_RETRIEVE_FAILED,
      expect.objectContaining({
        errorName: mockError.name,
        errorMessage: expect.stringContaining('GET /submissions, validation failed: Validation failed')
      })
    )
    expect(mockH.response).not.toHaveBeenCalled()
  })
})
