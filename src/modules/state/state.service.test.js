import { createServer } from '../../server'
import {
  acquireOrRefreshApplicationLock,
  releaseApplicationLock,
  releaseAllApplicationLocksForOwner,
  saveApplicationState,
  getApplicationState,
  deleteApplicationState,
  patchApplicationState,
  insertSubmission,
  findSubmissions
} from './state.service'
import { initStateRepository } from './state.repository'

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
    await server.stateDb.collection('grant-application-locks').deleteMany({})
  })

  test('acquire and release lock', async () => {
    const params = {
      grantCode: 'EGWA',
      grantVersion: '1.0.0',
      sbi: '106514040',
      ownerId: 'user-1'
    }

    const lock = await acquireOrRefreshApplicationLock(params)
    expect(lock).toBeTruthy()

    const released = await releaseApplicationLock(params)
    expect(released).toBe(true)

    const lock2 = await acquireOrRefreshApplicationLock(params)
    expect(lock2).toBeTruthy()
  })

  test('legacy integer grantVersion is persisted as a semver string', async () => {
    const lock = await acquireOrRefreshApplicationLock({
      grantCode: 'EGWA',
      grantVersion: 1,
      sbi: '106514040',
      ownerId: 'user-1'
    })

    expect(lock).toBeTruthy()
    expect(lock.grantVersion).toBe('1.0.0')

    const stored = await server.stateDb
      .collection('grant-application-locks')
      .findOne({ grantCode: 'EGWA', sbi: '106514040', ownerId: 'user-1' })
    expect(stored.grantVersion).toBe('1.0.0')

    // Releasing with the same legacy value resolves to the same semver lock
    const released = await releaseApplicationLock({
      grantCode: 'EGWA',
      grantVersion: 1,
      sbi: '106514040',
      ownerId: 'user-1'
    })
    expect(released).toBe(true)
  })

  test('expired lock can be taken over by another user', async () => {
    const now = new Date()

    await server.stateDb.collection('grant-application-locks').insertOne({
      grantCode: 'EGWA',
      grantVersion: '1.0.0',
      sbi: '106',
      ownerId: 'user-1',
      lockedAt: now,
      expiresAt: new Date(now.getTime() - 60_000) // expired
    })

    const lock = await acquireOrRefreshApplicationLock({
      grantCode: 'EGWA',
      grantVersion: '1.0.0',
      sbi: '106',
      ownerId: 'user-2'
    })

    expect(lock).not.toBeNull()
    expect(lock.ownerId).toBe('user-2')
  })

  test('same user can reacquire their own lock (re-entrant)', async () => {
    const params = { grantCode: 'EGWA', grantVersion: '1.0.0', sbi: '106', ownerId: 'user-1' }

    await acquireOrRefreshApplicationLock(params)
    const second = await acquireOrRefreshApplicationLock(params)

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

    initStateRepository(fakeDb)
    const result = await acquireOrRefreshApplicationLock({
      grantCode: 'EGWA',
      grantVersion: '1.0.0',
      sbi: '106',
      ownerId: 'user-1'
    })
    initStateRepository(server.stateDb)

    expect(result).toBeNull()
  })

  test('acquireOrRefreshApplicationLock re-throws on non-11000 error', async () => {
    const fakeDb = {
      collection: () => ({
        findOneAndUpdate: () => {
          throw Object.assign(new Error('Mongo exploded'), { name: 'MongoServerError', code: 123 })
        }
      })
    }

    const params = { grantCode: 'EGWA', grantVersion: '1.0.0', sbi: '106', ownerId: 'user-1' }

    initStateRepository(fakeDb)
    await expect(acquireOrRefreshApplicationLock(params)).rejects.toThrow('Mongo exploded')
    initStateRepository(server.stateDb)
  })

  test('releaseApplicationLock re-throws on error', async () => {
    const fakeDb = {
      collection: () => ({
        deleteOne: () => {
          throw Object.assign(new Error('Mongo exploded'), { name: 'MongoServerError', code: 123 })
        }
      })
    }

    const params = { grantCode: 'EGWA', grantVersion: '1.0.0', sbi: '106', ownerId: 'user-1' }

    initStateRepository(fakeDb)
    await expect(releaseApplicationLock(params)).rejects.toThrow('Mongo exploded')
    initStateRepository(server.stateDb)
  })

  test('releaseAllApplicationLocksForOwner deletes all locks', async () => {
    const db = server.stateDb

    await db.collection('grant-application-locks').deleteMany({ ownerId: 'user-1' })
    await db.collection('grant-application-locks').insertMany([
      { grantCode: 'A', grantVersion: '1.0.0', sbi: '1', ownerId: 'user-1' },
      { grantCode: 'B', grantVersion: '1.0.0', sbi: '2', ownerId: 'user-1' }
    ])

    const deletedCount = await releaseAllApplicationLocksForOwner({ ownerId: 'user-1' })

    expect(deletedCount).toBe(2)
  })

  test('releaseAllApplicationLocksForOwner re-throws on error', async () => {
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

    initStateRepository(fakeDb)
    await expect(releaseAllApplicationLocksForOwner({ ownerId: 'user-1' })).rejects.toThrow('Mongo exploded')
    initStateRepository(server.stateDb)
  })
})

describe('state CRUD service pass-throughs', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  afterEach(() => {
    initStateRepository(server.stateDb)
  })

  const params = { sbi: '123456789', grantCode: 'EGWA', grantVersion: '1.0.0' }

  test('saveApplicationState delegates to repository', async () => {
    const fakeDb = {
      collection: () => ({
        updateOne: () => ({ upsertedCount: 1 })
      })
    }
    initStateRepository(fakeDb)
    const result = await saveApplicationState({ ...params, state: {} })
    expect(result).toEqual({ upsertedCount: 1 })
  })

  test('saveApplicationState persists decomposed semver fields on insert', async () => {
    let capturedFilter
    let capturedUpdate
    const fakeDb = {
      collection: () => ({
        updateOne: (filter, update) => {
          capturedFilter = filter
          capturedUpdate = update
          return { upsertedCount: 1 }
        }
      })
    }
    initStateRepository(fakeDb)

    await saveApplicationState({ sbi: '123456789', grantCode: 'EGWA', grantVersion: 1, state: {} })

    expect(capturedFilter.grantVersion).toBe('1.0.0')
    expect(capturedUpdate.$setOnInsert).toMatchObject({ pinnedMajor: 1, major: 1, minor: 0, patch: 0 })
  })

  test('getApplicationState delegates to repository', async () => {
    const fakeDb = {
      collection: () => ({
        findOne: () => ({ sbi: '123456789', state: {} })
      })
    }
    initStateRepository(fakeDb)
    const result = await getApplicationState(params)
    expect(result).toEqual({ sbi: '123456789', state: {} })
  })

  test('deleteApplicationState delegates to repository', async () => {
    const fakeDb = {
      collection: () => ({
        findOneAndDelete: () => ({ _id: 'abc', ...params })
      })
    }
    initStateRepository(fakeDb)
    const result = await deleteApplicationState(params)
    expect(result).toMatchObject(params)
  })

  test('patchApplicationState delegates to repository', async () => {
    const fakeDb = {
      collection: () => ({
        findOneAndUpdate: () => ({ ...params, state: { applicationStatus: 'submitted' } })
      })
    }
    initStateRepository(fakeDb)
    const result = await patchApplicationState({ ...params, applicationStatus: 'submitted' })
    expect(result).toMatchObject(params)
  })

  test('insertSubmission delegates to repository', async () => {
    const submission = {
      sbi: '123',
      grantCode: 'EGWA',
      grantVersion: '1.0.0',
      referenceNumber: 'REF1',
      submittedAt: new Date()
    }
    const fakeDb = {
      collection: () => ({
        insertOne: () => ({ insertedId: 'abc' })
      })
    }
    initStateRepository(fakeDb)
    const result = await insertSubmission(submission)
    expect(result).toEqual({ insertedId: 'abc' })
  })

  test('findSubmissions delegates to repository', async () => {
    const fakeDb = {
      collection: () => ({
        find: () => ({ sort: () => ({ toArray: () => [{ sbi: '123' }] }) })
      })
    }
    initStateRepository(fakeDb)
    const result = await findSubmissions({ sbi: '123' })
    expect(result).toEqual([{ sbi: '123' }])
  })
})
