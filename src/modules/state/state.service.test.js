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
  findSubmissions,
  getStateWithFormDefinition
} from './state.service'
import { initStateRepository } from './state.repository'
import { resolveLatestVersion, resolveLatestVersionWithinMajor } from '../config/config.service.js'

jest.mock('../config/config.service.js', () => ({
  resolveLatestVersion: jest.fn(),
  resolveLatestVersionWithinMajor: jest.fn()
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
    await server.stateDb.collection('state__grant_application_locks').deleteMany({})
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
      .collection('state__grant_application_locks')
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

    await server.stateDb.collection('state__grant_application_locks').insertOne({
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

    await db.collection('state__grant_application_locks').deleteMany({ ownerId: 'user-1' })
    await db.collection('state__grant_application_locks').insertMany([
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

describe('getStateWithFormDefinition orchestration', () => {
  const baseParams = { sbi: '123456789', grantCode: 'EGWA', ownerId: 'user-1' }

  /**
   * Builds a fake state db where the latest-state finder resolves to `existingState`
   * and exposes spies for the version-update and lock-acquire collection calls.
   *
   * @param {object|null} existingState - the doc the latest-state finder resolves to
   * @param {object|null} [acquiredLock] - what the lock acquisition resolves to
   *   (a truthy lock by default; pass `null` to simulate a lock held by another owner)
   */
  const buildStateDb = (existingState, acquiredLock = { _id: 'lock-1' }) => {
    const stateUpdate = jest.fn().mockImplementation((_filter, update) => ({
      _id: 'state-1',
      grantVersion: update.$set.grantVersion,
      major: update.$set.major,
      minor: update.$set.minor,
      patch: update.$set.patch
    }))
    // The lock is acquired inside the orchestrator, against the resolved version,
    // via acquireOrRefreshApplicationLock's findOneAndUpdate.
    const lockAcquire = jest.fn().mockResolvedValue(acquiredLock)
    // Best-effort release of the old-version lock after an upgrade -> deleteOne.
    const lockRelease = jest.fn().mockResolvedValue({ deletedCount: 1 })

    const fakeDb = {
      collection: (name) => {
        if (name === 'state__grant_application_locks') {
          return { findOneAndUpdate: lockAcquire, deleteOne: lockRelease }
        }
        return {
          find: () => ({
            sort: () => ({ limit: () => ({ next: () => Promise.resolve(existingState) }) })
          }),
          findOneAndUpdate: stateUpdate
        }
      }
    }

    return { fakeDb, stateUpdate, lockAcquire, lockRelease }
  }

  afterEach(() => {
    jest.clearAllMocks()
    initStateRepository(null)
  })

  test('no state + latest definition exists -> returns { definition, state: null } with no state write but a lock acquired', async () => {
    const definition = { grantCode: 'EGWA', major: 2, minor: 1, patch: 0 }
    resolveLatestVersion.mockResolvedValue(definition)
    const { fakeDb, stateUpdate, lockAcquire } = buildStateDb(null)
    initStateRepository(fakeDb)

    const result = await getStateWithFormDefinition(baseParams)

    expect(resolveLatestVersion).toHaveBeenCalledWith('EGWA')
    expect(result).toEqual({ definition, state: null, upgraded: false })
    expect(stateUpdate).not.toHaveBeenCalled()
    // Lock acquired against the resolved version even though no state was written.
    expect(lockAcquire).toHaveBeenCalledWith(
      expect.objectContaining({ grantCode: 'EGWA', grantVersion: '2.1.0', sbi: '123456789' }),
      expect.anything(),
      expect.anything()
    )
  })

  test('no state + no definition -> returns null without acquiring a lock', async () => {
    resolveLatestVersion.mockResolvedValue(null)
    const { fakeDb, lockAcquire } = buildStateDb(null)
    initStateRepository(fakeDb)

    const result = await getStateWithFormDefinition(baseParams)

    expect(result).toBeNull()
    expect(lockAcquire).not.toHaveBeenCalled()
  })

  test('existing state + version unchanged -> read-only, acquires lock and returns stored state', async () => {
    const existingState = { _id: 'state-1', grantVersion: '1.3.0', pinnedMajor: 1, major: 1, minor: 3, patch: 0 }
    const definition = { grantCode: 'EGWA', major: 1, minor: 3, patch: 0 }
    resolveLatestVersionWithinMajor.mockResolvedValue(definition)
    const { fakeDb, stateUpdate, lockAcquire, lockRelease } = buildStateDb(existingState)
    initStateRepository(fakeDb)

    const result = await getStateWithFormDefinition(baseParams)

    expect(resolveLatestVersionWithinMajor).toHaveBeenCalledWith('EGWA', 1)
    expect(result).toEqual({ definition, state: existingState, upgraded: false })
    expect(stateUpdate).not.toHaveBeenCalled()
    expect(lockAcquire).toHaveBeenCalledWith(
      expect.objectContaining({ grantCode: 'EGWA', grantVersion: '1.3.0', sbi: '123456789' }),
      expect.anything(),
      expect.anything()
    )
    // No upgrade -> no old-version lock to release.
    expect(lockRelease).not.toHaveBeenCalled()
  })

  test('existing state + version changed -> acquires lock on resolved version and persists upgrade', async () => {
    const existingState = { _id: 'state-1', grantVersion: '1.0.0', pinnedMajor: 1, major: 1, minor: 0, patch: 0 }
    const definition = { grantCode: 'EGWA', major: 1, minor: 4, patch: 2 }
    resolveLatestVersionWithinMajor.mockResolvedValue(definition)
    const { fakeDb, stateUpdate, lockAcquire, lockRelease } = buildStateDb(existingState)
    initStateRepository(fakeDb)

    const result = await getStateWithFormDefinition(baseParams)

    expect(stateUpdate).toHaveBeenCalledWith(
      { _id: 'state-1' },
      {
        $set: { grantVersion: '1.4.2', major: 1, minor: 4, patch: 2 },
        $currentDate: { updatedAt: true }
      },
      { returnDocument: 'after' }
    )
    // The lock is acquired directly against the resolved version.
    expect(lockAcquire).toHaveBeenCalledWith(
      expect.objectContaining({ grantCode: 'EGWA', grantVersion: '1.4.2', sbi: '123456789' }),
      expect.anything(),
      expect.anything()
    )
    expect(result.definition).toBe(definition)
    expect(result.state.grantVersion).toBe('1.4.2')
    expect(result.upgraded).toBe(true)
    expect(result.fromVersion).toBe('1.0.0')
    expect(result.toVersion).toBe('1.4.2')
    // Best-effort release of the now-orphaned lock on the previous version.
    expect(lockRelease).toHaveBeenCalledWith(
      expect.objectContaining({ grantCode: 'EGWA', grantVersion: '1.0.0', sbi: '123456789', ownerId: 'user-1' })
    )
  })

  test('existing state + version changed -> upgrade still succeeds if old-lock release fails', async () => {
    const existingState = { _id: 'state-1', grantVersion: '1.0.0', pinnedMajor: 1, major: 1, minor: 0, patch: 0 }
    const definition = { grantCode: 'EGWA', major: 1, minor: 4, patch: 2 }
    resolveLatestVersionWithinMajor.mockResolvedValue(definition)
    const { fakeDb, lockRelease } = buildStateDb(existingState)
    // Simulate the old-version lock release throwing -> must be swallowed.
    lockRelease.mockRejectedValue(new Error('release boom'))
    initStateRepository(fakeDb)

    const result = await getStateWithFormDefinition(baseParams)

    expect(result.upgraded).toBe(true)
    expect(result.toVersion).toBe('1.4.2')
    expect(lockRelease).toHaveBeenCalled()
  })

  test('lock held by another owner -> throws 423 Locked', async () => {
    const definition = { grantCode: 'EGWA', major: 2, minor: 1, patch: 0 }
    resolveLatestVersion.mockResolvedValue(definition)
    // Acquisition resolves to null -> the lock is held by someone else.
    const { fakeDb, stateUpdate } = buildStateDb(null, null)
    initStateRepository(fakeDb)

    await expect(getStateWithFormDefinition(baseParams)).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 423 }
    })
    expect(stateUpdate).not.toHaveBeenCalled()
  })

  test('existing state with no pinnedMajor falls back to major', async () => {
    const existingState = { _id: 'state-1', grantVersion: '2.0.0', major: 2, minor: 0, patch: 0 }
    const definition = { grantCode: 'EGWA', major: 2, minor: 0, patch: 0 }
    resolveLatestVersionWithinMajor.mockResolvedValue(definition)
    const { fakeDb } = buildStateDb(existingState)
    initStateRepository(fakeDb)

    await getStateWithFormDefinition(baseParams)

    expect(resolveLatestVersionWithinMajor).toHaveBeenCalledWith('EGWA', 2)
  })

  test('existing state + no definition within major -> returns null without acquiring a lock', async () => {
    const existingState = { _id: 'state-1', grantVersion: '1.0.0', pinnedMajor: 1, major: 1, minor: 0, patch: 0 }
    resolveLatestVersionWithinMajor.mockResolvedValue(null)
    const { fakeDb, stateUpdate, lockAcquire } = buildStateDb(existingState)
    initStateRepository(fakeDb)

    const result = await getStateWithFormDefinition(baseParams)

    expect(result).toBeNull()
    expect(stateUpdate).not.toHaveBeenCalled()
    expect(lockAcquire).not.toHaveBeenCalled()
  })

  describe('includeDefinition: false (state-only)', () => {
    test('existing state -> returns the stored state with no definition, skipping all definition resolution', async () => {
      const existingState = { _id: 'state-1', grantVersion: '1.3.0', pinnedMajor: 1, major: 1, minor: 3, patch: 0 }
      const { fakeDb, stateUpdate, lockAcquire, lockRelease } = buildStateDb(existingState)
      initStateRepository(fakeDb)

      const result = await getStateWithFormDefinition({ ...baseParams, includeDefinition: false })

      // No definition resolution happens at all in state-only mode.
      expect(resolveLatestVersion).not.toHaveBeenCalled()
      expect(resolveLatestVersionWithinMajor).not.toHaveBeenCalled()
      // The result omits `definition` entirely and reports no upgrade.
      expect(result).toEqual({ state: existingState, upgraded: false })
      expect(result).not.toHaveProperty('definition')
      // No version-upgrade write occurs.
      expect(stateUpdate).not.toHaveBeenCalled()
      expect(lockRelease).not.toHaveBeenCalled()
      // The lock is acquired against the state's own existing version.
      expect(lockAcquire).toHaveBeenCalledWith(
        expect.objectContaining({ grantCode: 'EGWA', grantVersion: '1.3.0', sbi: '123456789' }),
        expect.anything(),
        expect.anything()
      )
    })

    test('no state -> returns { state: null } without resolving a definition or acquiring a lock', async () => {
      const { fakeDb, stateUpdate, lockAcquire } = buildStateDb(null)
      initStateRepository(fakeDb)

      const result = await getStateWithFormDefinition({ ...baseParams, includeDefinition: false })

      expect(resolveLatestVersion).not.toHaveBeenCalled()
      expect(resolveLatestVersionWithinMajor).not.toHaveBeenCalled()
      expect(result).toEqual({ state: null, upgraded: false })
      expect(result).not.toHaveProperty('definition')
      expect(stateUpdate).not.toHaveBeenCalled()
      expect(lockAcquire).not.toHaveBeenCalled()
    })

    test('existing state but lock held by another owner -> throws 423 Locked', async () => {
      const existingState = { _id: 'state-1', grantVersion: '1.3.0', pinnedMajor: 1, major: 1, minor: 3, patch: 0 }
      // Acquisition resolves to null -> the lock is held by someone else.
      const { fakeDb } = buildStateDb(existingState, null)
      initStateRepository(fakeDb)

      await expect(getStateWithFormDefinition({ ...baseParams, includeDefinition: false })).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 423 }
      })
    })
  })
})
