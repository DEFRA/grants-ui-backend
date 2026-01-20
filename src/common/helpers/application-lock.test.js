import { createServer } from '../../server'
import {
  acquireOrRefreshApplicationLock,
  releaseApplicationLock,
  releaseAllApplicationLocksForOwner
} from './application-lock'
import { log, LogCodes } from '~/src/common/helpers/logging/log.js'

jest.mock('~/src/common/helpers/logging/log.js', () => ({
  log: jest.fn(),
  LogCodes: {
    SYSTEM: {
      APPLICATION_LOCK_ACQUIRED: { level: 'info', messageFunc: jest.fn() },
      APPLICATION_LOCK_RELEASED: { level: 'info', messageFunc: jest.fn() },
      APPLICATION_LOCKS_RELEASED: { level: 'info', messageFunc: jest.fn() },

      APPLICATION_LOCK_ACQUISITION_FAILED: { level: 'error', messageFunc: jest.fn() },
      APPLICATION_LOCK_RELEASE_FAILED: { level: 'error', messageFunc: jest.fn() },
      APPLICATION_LOCKS_RELEASE_FAILED: { level: 'error', messageFunc: jest.fn() }
    }
  }
}))

describe('application locks', () => {
  let server
  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  afterEach(async () => {
    jest.clearAllMocks()
    await server.db.collection('grant-application-locks').deleteMany({})
  })

  test('acquire and release lock', async () => {
    const db = server.db

    const params = {
      grantCode: 'EGWA',
      grantVersion: 1,
      sbi: '106514040',
      ownerId: 'user-1'
    }

    const lock = await acquireOrRefreshApplicationLock(db, params)
    expect(lock).toBeTruthy()

    expect(log).toHaveBeenCalledWith(
      LogCodes.SYSTEM.APPLICATION_LOCK_ACQUIRED,
      expect.objectContaining({
        grantCode: 'EGWA',
        grantVersion: 1,
        sbi: '106514040',
        ownerId: 'user-1'
      })
    )

    const released = await releaseApplicationLock(db, params)
    expect(released).toBe(true)

    expect(log).toHaveBeenCalledWith(
      LogCodes.SYSTEM.APPLICATION_LOCK_RELEASED,
      expect.objectContaining({
        grantCode: 'EGWA',
        grantVersion: 1,
        sbi: '106514040',
        ownerId: 'user-1'
      })
    )

    const lock2 = await acquireOrRefreshApplicationLock(db, params)
    expect(lock2).toBeTruthy()
  })

  test('expired lock can be taken over by another user', async () => {
    const db = server.db
    const now = new Date()

    await db.collection('grant-application-locks').insertOne({
      grantCode: 'EGWA',
      grantVersion: 1,
      sbi: '106',
      ownerId: 'user-1',
      lockedAt: now,
      expiresAt: new Date(now.getTime() - 60_000) // expired
    })

    const lock = await acquireOrRefreshApplicationLock(db, {
      grantCode: 'EGWA',
      grantVersion: 1,
      sbi: '106',
      ownerId: 'user-2'
    })

    expect(lock).not.toBeNull()
    expect(lock.ownerId).toBe('user-2')
  })

  test('same user can reacquire their own lock (re-entrant)', async () => {
    const db = server.db

    const params = { grantCode: 'EGWA', grantVersion: 1, sbi: '106', ownerId: 'user-1' }

    await acquireOrRefreshApplicationLock(db, params)
    const second = await acquireOrRefreshApplicationLock(db, params)

    expect(second.ownerId).toBe('user-1')
  })

  test('returns null on duplicate key error (11000)', async () => {
    const fakeDb = {
      collection: () => ({
        findOneAndUpdate: () => {
          throw Object.assign(new Error('Duplicate'), {
            name: 'MongoServerError',
            code: 11000
          })
        }
      })
    }

    const result = await acquireOrRefreshApplicationLock(fakeDb, {
      grantCode: 'EGWA',
      grantVersion: 1,
      sbi: '106',
      ownerId: 'user-1'
    })

    expect(result).toBeNull()
  })

  test('logs error when acquireApplicationLock fails', async () => {
    const fakeDb = {
      collection: () => ({
        findOneAndUpdate: () => {
          throw Object.assign(new Error('Mongo exploded'), { name: 'MongoServerError', code: 123 })
        }
      })
    }

    const params = { grantCode: 'EGWA', grantVersion: 1, sbi: '106', ownerId: 'user-1' }

    await expect(acquireOrRefreshApplicationLock(fakeDb, params)).rejects.toThrow('Mongo exploded')

    expect(log).toHaveBeenCalledWith(
      LogCodes.SYSTEM.APPLICATION_LOCK_ACQUISITION_FAILED,
      expect.objectContaining({
        grantCode: 'EGWA',
        grantVersion: 1,
        sbi: '106',
        ownerId: 'user-1',
        errorName: 'MongoServerError',
        errorMessage: 'Mongo exploded',
        isMongoError: true
      })
    )
  })

  test('logs error when releaseApplicationLock fails', async () => {
    const fakeDb = {
      collection: () => ({
        deleteOne: () => {
          throw Object.assign(new Error('Mongo exploded'), { name: 'MongoServerError', code: 123 })
        }
      })
    }

    const params = { grantCode: 'EGWA', grantVersion: 1, sbi: '106', ownerId: 'user-1' }

    await expect(releaseApplicationLock(fakeDb, params)).rejects.toThrow('Mongo exploded')

    expect(log).toHaveBeenCalledWith(
      LogCodes.SYSTEM.APPLICATION_LOCK_RELEASE_FAILED,
      expect.objectContaining({
        grantCode: 'EGWA',
        grantVersion: 1,
        sbi: '106',
        ownerId: 'user-1',
        errorName: 'MongoServerError',
        errorMessage: 'Mongo exploded',
        isMongoError: true
      })
    )
  })

  test('releaseAllApplicationLocksForOwner deletes all locks and logs', async () => {
    const db = server.db

    await db.collection('grant-application-locks').insertMany([
      { grantCode: 'A', grantVersion: 1, sbi: '1', ownerId: 'user-1' },
      { grantCode: 'B', grantVersion: 1, sbi: '2', ownerId: 'user-1' }
    ])

    const deletedCount = await releaseAllApplicationLocksForOwner(db, { ownerId: 'user-1' })

    expect(deletedCount).toBe(2)

    expect(log).toHaveBeenCalledWith(
      LogCodes.SYSTEM.APPLICATION_LOCKS_RELEASED,
      expect.objectContaining({
        ownerId: 'user-1',
        releasedCount: 2
      })
    )
  })

  test('logs error when releaseAllApplicationLocksForOwner fails', async () => {
    const fakeDb = {
      collection: () => ({
        deleteMany: () => {
          throw Object.assign(new Error('Mongo exploded'), {
            name: 'MongoServerError',
            code: 123
          })
        }
      })
    }

    await expect(releaseAllApplicationLocksForOwner(fakeDb, { ownerId: 'user-1' })).rejects.toThrow('Mongo exploded')

    expect(log).toHaveBeenCalledWith(
      LogCodes.SYSTEM.APPLICATION_LOCKS_RELEASE_FAILED,
      expect.objectContaining({
        ownerId: 'user-1',
        isMongoError: true
      })
    )
  })
})
