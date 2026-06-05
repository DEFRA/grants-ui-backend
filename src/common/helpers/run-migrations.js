import { up, config as migrateMongoConfig } from 'migrate-mongo'
import { log, LogCodes } from './logging/log.js'

/**
 * Error message thrown by migrate-mongo's `up` when another instance already
 * holds the changelog lock. We treat this as "another instance is migrating"
 * rather than a fatal failure.
 */
export const LOCK_IN_PLACE_MESSAGE = 'Could not migrate up, a lock is in place.'

/**
 * Defaults for the lock-contention back-off. Total wait must comfortably exceed
 * the slowest migration so a non-migrating instance can start once the winner
 * has finished applying pending migrations.
 */
export const DEFAULT_RETRY_OPTIONS = {
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  maxWaitMs: 120000,
  backoffFactor: 2
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isLockInPlaceError = (error) => error instanceof Error && error.message === LOCK_IN_PLACE_MESSAGE

/**
 * Ensure a unique index on `changelog.fileName` exists. This is a hard backstop
 * against duplicate changelog rows / double-apply even if the lock ever fails.
 * Idempotent: re-creating an identical index is a no-op.
 *
 * @param {import('mongodb').Db} db
 * @param {string} [changelogCollectionName]
 */
export async function ensureChangelogIndex(db, changelogCollectionName = 'changelog') {
  await db.collection(changelogCollectionName).createIndex({ fileName: 1 }, { unique: true, name: 'uniq_fileName' })
}

/**
 * Invoke `runFn` (an `up` call) and, when another instance holds the lock, poll
 * with exponential back-off until it succeeds (lock cleared / no pending
 * migrations) or `maxWaitMs` elapses. Rethrows on timeout or any non-lock error
 * so startup fails loudly.
 *
 * @param {() => Promise<unknown>} runFn
 * @param {object} [options]
 * @param {string} [options.db] database name used for structured log context
 * @returns {Promise<unknown>}
 */
export async function withLockRetry(runFn, options = {}) {
  const { initialDelayMs, maxDelayMs, maxWaitMs, backoffFactor } = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options
  }
  const db = options.db

  const deadline = Date.now() + maxWaitMs
  let delay = initialDelayMs

  for (;;) {
    try {
      return await runFn()
    } catch (error) {
      if (!isLockInPlaceError(error)) {
        throw error
      }

      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        throw new Error(`Timed out after ${maxWaitMs}ms waiting for another instance to finish migrations`)
      }

      const waitMs = Math.min(delay, remaining)
      log(LogCodes.MIGRATIONS.LOCKED_RETRY, { db, waitMs })
      await sleep(waitMs)
      delay = Math.min(delay * backoffFactor, maxDelayMs)
    }
  }
}

/**
 * Run pending migrations for a single database: ensure the changelog backstop
 * index, then apply `up` with lock-contention back-off. Rethrows on real failure.
 *
 * @param {import('mongodb').Db} db
 * @param {object} mongoConfig migrate-mongo config object
 * @param {object} [options]
 * @param {object} [options.retryOptions]
 * @returns {Promise<string[]>} the file names of the migrations that were applied
 */
export async function runMigrations(db, mongoConfig, options = {}) {
  const dbName = mongoConfig?.mongodb?.databaseName ?? mongoConfig?.databaseName
  // migrate-mongo's `up`/`status` read configuration from a config file on disk
  // (defaulting to `migrate-mongo-config.js` in the cwd) unless an in-memory
  // config is provided via `config.set`. We pass the already-imported config
  // object so migrate-mongo never tries to load a non-existent default file
  // (e.g. inside the Docker image, which only ships the per-db config files).
  migrateMongoConfig.set(mongoConfig)
  await ensureChangelogIndex(db, mongoConfig?.changelogCollectionName)
  const applied = await withLockRetry(() => up(db, mongoConfig), { ...options.retryOptions, db: dbName })

  if (applied.length > 0) {
    log(LogCodes.MIGRATIONS.APPLIED, { db: dbName, count: applied.length, files: applied.join(',') })
  } else {
    log(LogCodes.MIGRATIONS.NONE_PENDING, { db: dbName })
  }

  return applied
}
