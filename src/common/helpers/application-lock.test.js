import { createServer } from '../../server'
import { acquireApplicationLock, releaseApplicationLock } from './application-lock'
import { log, LogCodes } from '~/src/common/helpers/logging/log.js'

jest.mock('~/src/common/helpers/logging/log.js', () => ({
  log: jest.fn(),
  LogCodes: {
    SYSTEM: {
      APPLICATION_LOCK_ACQUISITION_FAILED: { level: 'error', messageFunc: jest.fn() },
      APPLICATION_LOCK_RELEASE_FAILED: { level: 'error', messageFunc: jest.fn() }
    }
  }
}))

describe('getApplicationLockId', () => {
  let server
  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  afterEach(async () => {
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

    const lock = await acquireApplicationLock(db, params)
    expect(lock).toBeTruthy()

    await releaseApplicationLock(db, params)

    const lock2 = await acquireApplicationLock(db, params)
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

    const lock = await acquireApplicationLock(db, {
      grantCode: 'EGWA',
      grantVersion: 1,
      sbi: '106',
      ownerId: 'user-2'
    })

    expect(lock).not.toBeNull()
    expect(lock.ownerId).toBe('user-2')
  })

  test('same user can reacquire their own lock (reentrant)', async () => {
    const db = server.db

    const params = { grantCode: 'EGWA', grantVersion: 1, sbi: '106', ownerId: 'user-1' }

    await acquireApplicationLock(db, params)
    const second = await acquireApplicationLock(db, params)

    expect(second.ownerId).toBe('user-1')
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

    await expect(acquireApplicationLock(fakeDb, params)).rejects.toThrow('Mongo exploded')

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
})
