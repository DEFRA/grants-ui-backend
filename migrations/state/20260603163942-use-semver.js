import { log, LogCodes } from '../../src/common/helpers/logging/log.js'

const STATE_COLLECTION = 'grant-application-state'
const LOCKS_COLLECTION = 'grant-application-locks'
const SUBMISSIONS_COLLECTION = 'grant_application_submissions'

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/
const SAFE_DEFAULT_VERSION = '1.0.0'
const SAFE_DEFAULT_MAJOR = 1

/**
 * Parses a raw grantVersion value into semver parts.
 * Falls back to safe defaults if the value cannot be parsed.
 *
 * @param {unknown} raw
 * @param {{ collection?: string, grantCode?: unknown }} [context] context for structured logging on fallback
 * @returns {{ semver: string, major: number, minor: number, patch: number }}
 */
function parseSemver(raw, context = {}) {
  if (typeof raw === 'string') {
    const full = raw.match(SEMVER_RE)
    if (full) {
      return { semver: raw, major: Number(full[1]), minor: Number(full[2]), patch: Number(full[3]) }
    }
    const majorOnly = raw.match(/^(\d+)$/)
    if (majorOnly) {
      const major = Number(majorOnly[1])
      return { semver: `${major}.0.0`, major, minor: 0, patch: 0 }
    }
  }

  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) {
    return { semver: `${raw}.0.0`, major: raw, minor: 0, patch: 0 }
  }

  log(LogCodes.MIGRATIONS.VERSION_PARSE_FALLBACK, {
    collection: context.collection,
    grantCode: context.grantCode,
    version: raw,
    defaultVersion: SAFE_DEFAULT_VERSION
  })
  return { semver: SAFE_DEFAULT_VERSION, major: SAFE_DEFAULT_MAJOR, minor: 0, patch: 0 }
}

/**
 * Migrates grant-application-state documents.
 *
 * Idempotency guard: skips documents that already have pinnedMajor set.
 * Sets grantVersion to a semver string and adds pinnedMajor, major, minor, patch —
 * required for config broker integration and version-aware querying.
 *
 * @param {import('mongodb').Db} db
 */
async function migrateStateCollection(db) {
  const collection = db.collection(STATE_COLLECTION)
  const filter = { pinnedMajor: { $exists: false } }

  for await (const doc of collection.find(filter)) {
    const { semver, major, minor, patch } = parseSemver(doc.grantVersion, {
      collection: STATE_COLLECTION,
      grantCode: doc.grantCode
    })
    await collection.updateOne(
      { _id: doc._id },
      { $set: { grantVersion: semver, pinnedMajor: major, major, minor, patch } }
    )
  }
}

/**
 * Migrates a collection that only needs grantVersion normalised to a semver string.
 *
 * Idempotency guard: skips documents whose grantVersion already matches semver.
 * Locks and submissions are not queried by pinnedMajor or decomposed semver parts,
 * so no additional fields are needed.
 *
 * @param {import('mongodb').Db} db
 * @param {string} collectionName
 */
async function migrateVersionOnlyCollection(db, collectionName) {
  const collection = db.collection(collectionName)
  const filter = { $nor: [{ grantVersion: { $regex: '^\\d+\\.\\d+\\.\\d+$' } }] }

  for await (const doc of collection.find(filter)) {
    const { semver } = parseSemver(doc.grantVersion, {
      collection: collectionName,
      grantCode: doc.grantCode
    })
    await collection.updateOne({ _id: doc._id }, { $set: { grantVersion: semver } })
  }
}

/**
 * Runs the migration directly without a transaction. A transaction is
 * deliberately not used: it would require a replica set (failing on standalone
 * Mongo) and gives no protection across multiple instances. Safe re-runs are
 * instead guaranteed by the per-collection idempotency guards above, and
 * cross-instance serialisation is handled by migrate-mongo's changelog lock.
 *
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const up = async (db, client) => {
  await migrateStateCollection(db)
  await migrateVersionOnlyCollection(db, LOCKS_COLLECTION)
  await migrateVersionOnlyCollection(db, SUBMISSIONS_COLLECTION)
}

/**
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const down = async (db, client) => {
  // Intentionally not implemented: this migration is a one-way data normalisation.
  // Reverting semver strings back to integers is not safe as the original values
  // are not preserved. If rollback is needed, restore from a database backup.
}
