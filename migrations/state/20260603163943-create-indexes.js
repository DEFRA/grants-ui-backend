const LOCKS_COLLECTION = 'grant-application-locks'
const STATE_COLLECTION = 'grant-application-state'
const SUBMISSIONS_COLLECTION = 'grant_application_submissions'

/**
 * Creates the indexes required by the state module.
 *
 * `createIndex` is idempotent for an identical key + options, so re-running this
 * migration (or running it against an env where the indexes already exist) is a
 * no-op rather than an error.
 *
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const up = async (db, client) => {
  await db.collection(LOCKS_COLLECTION).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  await db.collection(LOCKS_COLLECTION).createIndex({ grantCode: 1, grantVersion: 1, sbi: 1 }, { unique: true })

  await db.collection(STATE_COLLECTION).createIndex({ sbi: 1, grantCode: 1, grantVersion: 1 }, { unique: true })

  await db
    .collection(SUBMISSIONS_COLLECTION)
    .createIndex({ sbi: 1, grantCode: 1, grantVersion: 1, referenceNumber: 1 }, { unique: true })
}

/**
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const down = async (db, client) => {
  await db
    .collection(LOCKS_COLLECTION)
    .dropIndex({ expiresAt: 1 })
    .catch(() => {})
  await db
    .collection(LOCKS_COLLECTION)
    .dropIndex({ grantCode: 1, grantVersion: 1, sbi: 1 })
    .catch(() => {})
  await db
    .collection(STATE_COLLECTION)
    .dropIndex({ sbi: 1, grantCode: 1, grantVersion: 1 })
    .catch(() => {})
  await db
    .collection(SUBMISSIONS_COLLECTION)
    .dropIndex({ sbi: 1, grantCode: 1, grantVersion: 1, referenceNumber: 1 })
    .catch(() => {})
}
