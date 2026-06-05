const mockUp = jest.fn()
const mockConfigSet = jest.fn()

jest.mock('migrate-mongo', () => ({
  up: (...args) => mockUp(...args),
  config: { set: (...args) => mockConfigSet(...args) }
}))

jest.mock('./logging/log.js', () => {
  const actual = jest.requireActual('./logging/log.js')
  return { ...actual, log: jest.fn() }
})

import { withLockRetry, runMigrations, ensureChangelogIndex, LOCK_IN_PLACE_MESSAGE } from './run-migrations.js'
import { log, LogCodes } from './logging/log.js'

describe('#withLockRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns immediately when runFn succeeds', async () => {
    const runFn = jest.fn().mockResolvedValue('done')

    await expect(withLockRetry(runFn, { maxWaitMs: 1000 })).resolves.toBe('done')
    expect(runFn).toHaveBeenCalledTimes(1)
  })

  test('retries on lock-in-place error then succeeds', async () => {
    const runFn = jest.fn().mockRejectedValueOnce(new Error(LOCK_IN_PLACE_MESSAGE)).mockResolvedValueOnce('done')

    await expect(
      withLockRetry(runFn, { initialDelayMs: 1, maxDelayMs: 2, maxWaitMs: 1000, db: 'my-db' })
    ).resolves.toBe('done')
    expect(runFn).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledWith(LogCodes.MIGRATIONS.LOCKED_RETRY, expect.objectContaining({ db: 'my-db' }))
  })

  test('rethrows immediately on a non-lock error', async () => {
    const runFn = jest.fn().mockRejectedValue(new Error('boom'))

    await expect(withLockRetry(runFn, { maxWaitMs: 1000 })).rejects.toThrow('boom')
    expect(runFn).toHaveBeenCalledTimes(1)
  })

  test('rethrows with timeout when the lock never clears', async () => {
    const runFn = jest.fn().mockRejectedValue(new Error(LOCK_IN_PLACE_MESSAGE))

    await expect(withLockRetry(runFn, { initialDelayMs: 1, maxDelayMs: 1, maxWaitMs: 5 })).rejects.toThrow(/Timed out/)
  })
})

describe('#ensureChangelogIndex', () => {
  test('creates a unique index on changelog.fileName', async () => {
    const createIndex = jest.fn().mockResolvedValue('uniq_fileName')
    const collection = jest.fn().mockReturnValue({ createIndex })
    const db = { collection }

    await ensureChangelogIndex(db, 'changelog')

    expect(collection).toHaveBeenCalledWith('changelog')
    expect(createIndex).toHaveBeenCalledWith({ fileName: 1 }, expect.objectContaining({ unique: true }))
  })
})

describe('#runMigrations', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('ensures changelog index then runs up', async () => {
    const createIndex = jest.fn().mockResolvedValue('uniq_fileName')
    const db = { collection: jest.fn().mockReturnValue({ createIndex }) }
    mockUp.mockResolvedValue(['0001-migration.js'])

    const cfg = { changelogCollectionName: 'changelog', databaseName: 'my-db' }
    await expect(runMigrations(db, cfg)).resolves.toEqual(['0001-migration.js'])

    expect(createIndex).toHaveBeenCalled()
    expect(mockConfigSet).toHaveBeenCalledWith(cfg)
    expect(mockUp).toHaveBeenCalledWith(db, cfg)
  })

  test('logs APPLIED at info level when migrations are applied', async () => {
    const createIndex = jest.fn().mockResolvedValue('uniq_fileName')
    const db = { collection: jest.fn().mockReturnValue({ createIndex }) }
    mockUp.mockResolvedValue(['0001-migration.js', '0002-migration.js'])

    const cfg = { changelogCollectionName: 'changelog', databaseName: 'my-db' }
    await runMigrations(db, cfg)

    expect(log).toHaveBeenCalledWith(
      LogCodes.MIGRATIONS.APPLIED,
      expect.objectContaining({ db: 'my-db', count: 2, files: '0001-migration.js,0002-migration.js' })
    )
  })

  test('logs NONE_PENDING when there is nothing to apply', async () => {
    const createIndex = jest.fn().mockResolvedValue('uniq_fileName')
    const db = { collection: jest.fn().mockReturnValue({ createIndex }) }
    mockUp.mockResolvedValue([])

    const cfg = { changelogCollectionName: 'changelog', databaseName: 'my-db' }
    await runMigrations(db, cfg)

    expect(log).toHaveBeenCalledWith(LogCodes.MIGRATIONS.NONE_PENDING, { db: 'my-db' })
  })

  test('reads the database name from the migrate-mongo mongodb config shape', async () => {
    const createIndex = jest.fn().mockResolvedValue('uniq_fileName')
    const db = { collection: jest.fn().mockReturnValue({ createIndex }) }
    mockUp.mockResolvedValue(['0001-migration.js'])

    const cfg = { changelogCollectionName: 'changelog', mongodb: { databaseName: 'real-db' } }
    await runMigrations(db, cfg)

    expect(log).toHaveBeenCalledWith(
      LogCodes.MIGRATIONS.APPLIED,
      expect.objectContaining({ db: 'real-db', count: 1, files: '0001-migration.js' })
    )
  })
})
