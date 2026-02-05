import { applicationLockRelease, applicationLocksRelease } from './lock.js'
import { log, LogCodes } from '~/src/common/helpers/logging/log.js'
import { releaseApplicationLock } from '~/src/common/helpers/application-lock.js'
import { verifyOwnerLockReleaseToken } from '../common/helpers/lock/lock-token.js'
import { releaseAllApplicationLocksForOwner } from '../common/helpers/application-lock.js'

jest.mock('~/src/common/helpers/logging/log.js', () => ({
  log: jest.fn(),
  LogCodes: {
    APPLICATION_LOCK: {
      RELEASE_FAILED: { level: 'error', messageFunc: jest.fn() }
    }
  }
}))
jest.mock('~/src/common/helpers/application-lock.js', () => ({
  releaseApplicationLock: jest.fn(),
  releaseAllApplicationLocksForOwner: jest.fn()
}))
jest.mock('../common/helpers/lock/lock-token.js', () => ({
  verifyOwnerLockReleaseToken: jest.fn()
}))

const createMockH = () => {
  const response = {
    code: jest.fn().mockReturnThis()
  }
  return {
    response: jest.fn(() => response)
  }
}

const createMockRequest = (overrides = {}) => ({
  query: {
    sbi: '123456789',
    ownerId: '34567',
    grantCode: 'GRANT1',
    grantVersion: '1'
  },
  db: {},
  ...overrides
})

describe('applicationLockRelease route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns released=true when lock is released', async () => {
    releaseApplicationLock.mockResolvedValue(true)

    const request = createMockRequest()
    const h = createMockH()

    const result = await applicationLockRelease.handler(request, h)

    expect(releaseApplicationLock).toHaveBeenCalledWith(request.db, {
      sbi: '123456789',
      grantCode: 'GRANT1',
      grantVersion: '1',
      ownerId: '34567'
    })

    expect(h.response).toHaveBeenCalledWith({
      success: true,
      released: true
    })
    expect(result.code).toHaveBeenCalledWith(200)
  })

  it('returns released=false when lock does not exist or is owned by another user', async () => {
    releaseApplicationLock.mockResolvedValue(false)

    const request = createMockRequest()
    const h = createMockH()

    const result = await applicationLockRelease.handler(request, h)

    expect(h.response).toHaveBeenCalledWith({
      success: true,
      released: false
    })
    expect(result.code).toHaveBeenCalledWith(200)
  })

  it('returns 500 when releaseApplicationLock throws', async () => {
    const err = new Error('Mongo exploded')
    err.code = 123
    err.reason = 'boom'

    releaseApplicationLock.mockRejectedValue(err)

    const request = createMockRequest()
    const h = createMockH()

    const result = await applicationLockRelease.handler(request, h)

    expect(h.response).toHaveBeenCalledWith({
      error: 'Failed to release application lock'
    })
    expect(result.code).toHaveBeenCalledWith(500)
  })

  it('logs and throws on validation failure (failAction)', async () => {
    const badRequest = {
      query: {
        // missing sbi
        ownerId: '34567',
        grantCode: 'GRANT1',
        grantVersion: '1'
      }
    }

    const schema = applicationLockRelease.options.validate.query
    const { error } = schema.validate(badRequest.query)

    expect(error).toBeInstanceOf(Error)

    expect(() => applicationLockRelease.options.validate.failAction(badRequest, {}, error)).toThrow()

    expect(log).toHaveBeenCalledWith(
      LogCodes.APPLICATION_LOCK.RELEASE_FAILED,
      expect.objectContaining({
        ownerId: '34567',
        grantCode: 'GRANT1',
        grantVersion: '1',
        errorName: error.name,
        errorMessage: expect.stringContaining('validation failed')
      })
    )
  })
})

describe('applicationLocksRelease route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const createMockH = () => {
    const response = {
      code: jest.fn().mockReturnThis()
    }
    return {
      response: jest.fn(() => response)
    }
  }

  const createRequest = (overrides = {}) => ({
    headers: {
      'x-application-lock-release': 'valid-token'
    },
    db: {},
    ...overrides
  })

  it('releases all locks for owner and returns deletedCount', async () => {
    verifyOwnerLockReleaseToken.mockReturnValue({ ownerId: 'user-123' })
    releaseAllApplicationLocksForOwner.mockResolvedValue(3)

    const request = createRequest()
    const h = createMockH()

    const result = await applicationLocksRelease.handler(request, h)

    expect(verifyOwnerLockReleaseToken).toHaveBeenCalledWith('valid-token')
    expect(releaseAllApplicationLocksForOwner).toHaveBeenCalledWith(request.db, { ownerId: 'user-123' })

    expect(h.response).toHaveBeenCalledWith({
      success: true,
      deletedCount: 3
    })
    expect(result.code).toHaveBeenCalledWith(200)
  })

  it('returns deletedCount=0 when no locks exist', async () => {
    verifyOwnerLockReleaseToken.mockReturnValue({ ownerId: 'user-123' })
    releaseAllApplicationLocksForOwner.mockResolvedValue(0)

    const request = createRequest()
    const h = createMockH()

    const result = await applicationLocksRelease.handler(request, h)

    expect(h.response).toHaveBeenCalledWith({
      success: true,
      deletedCount: 0
    })
    expect(result.code).toHaveBeenCalledWith(200)
  })

  it('throws Boom 401 when lock release token is missing', async () => {
    const request = createRequest({ headers: {} })
    const h = createMockH()

    await expect(applicationLocksRelease.handler(request, h)).rejects.toMatchObject({
      isBoom: true,
      output: {
        statusCode: 401
      },
      message: 'Missing lock token'
    })
  })

  it('returns 500 when releaseAllApplicationLocksForOwner throws', async () => {
    verifyOwnerLockReleaseToken.mockReturnValue({ ownerId: 'user-123' })
    releaseAllApplicationLocksForOwner.mockRejectedValue(new Error('Mongo exploded'))

    const request = createRequest()
    const h = createMockH()

    const result = await applicationLocksRelease.handler(request, h)

    expect(h.response).toHaveBeenCalledWith({
      error: 'Failed to release application locks'
    })
    expect(result.code).toHaveBeenCalledWith(500)
  })
})
