import { acquireLock, requireLock } from './mongo-lock.js'
import { log, LogCodes } from './logging/log'

jest.mock('./logging/log', () => ({
  log: jest.fn(),
  LogCodes: {
    SYSTEM: {
      LOCK_ACQUISITION_FAILED: { level: 'error', messageFunc: jest.fn() }
    }
  }
}))

describe('Lock Functions', () => {
  let locker
  let logger

  beforeEach(() => {
    locker = {
      lock: jest.fn()
    }
    logger = {
      error: jest.fn()
    }
  })

  describe('acquireLock', () => {
    test('should acquire lock and return it', async () => {
      const resource = 'testResource'
      const mockLock = { id: 'lockId' }

      locker.lock.mockResolvedValue(mockLock) // Mocking lock method to resolve a lock

      const result = await acquireLock(locker, resource, logger)

      expect(result).toEqual(mockLock)
      expect(logger.error).not.toHaveBeenCalled()
      expect(locker.lock).toHaveBeenCalledWith(resource)
    })

    test('should log error and return null if lock cannot be acquired', async () => {
      const resource = 'testResource'
      expect(LogCodes.SYSTEM.LOCK_ACQUISITION_FAILED).toBeDefined()

      locker.lock.mockResolvedValue(null) // Mocking lock method to resolve to null

      const result = await acquireLock(locker, resource, logger)

      expect(result).toBeNull()
      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.LOCK_ACQUISITION_FAILED,
        expect.objectContaining({
          resource
        })
      )
      expect(locker.lock).toHaveBeenCalledWith(resource)
    })

    test('should return null without logging when no logger provided', async () => {
      const resource = 'testResource'

      locker.lock.mockResolvedValue(null)

      const result = await acquireLock(locker, resource, null)

      expect(result).toBeNull()
      expect(locker.lock).toHaveBeenCalledWith(resource)
    })
  })

  describe('requireLock', () => {
    test('should acquire lock and return it', async () => {
      const resource = 'testResource'
      const mockLock = { id: 'lockId' }

      locker.lock.mockResolvedValue(mockLock) // Mocking lock method to resolve a lock

      const result = await requireLock(locker, resource)

      expect(result).toEqual(mockLock)
      expect(locker.lock).toHaveBeenCalledWith(resource)
    })

    test('should throw error if lock cannot be acquired', async () => {
      const resource = 'testResource'

      locker.lock.mockResolvedValue(null) // Mocking lock method to resolve to null

      await expect(requireLock(locker, resource)).rejects.toThrow(`Failed to acquire lock for ${resource}`)
      expect(locker.lock).toHaveBeenCalledWith(resource)
    })
  })
})
