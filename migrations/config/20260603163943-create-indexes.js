const COLLECTION = 'form-definitions'

/**
 * Creates the indexes required by the config module.
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
  // Compound index used by resolveLatestVersion and resolveLatestVersionWithinMajor
  await db
    .collection(COLLECTION)
    .createIndex({ grantCode: 1, status: 1, major: -1, minor: -1, patch: -1 }, { unique: true })

  // Exact-match index used by getDefinition
  await db.collection(COLLECTION).createIndex({ grantCode: 1, major: 1, minor: 1, patch: 1 }, { unique: true })
}

/**
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const down = async (db, client) => {
  await db
    .collection(COLLECTION)
    .dropIndex({ grantCode: 1, status: 1, major: -1, minor: -1, patch: -1 })
    .catch(() => {})
  await db
    .collection(COLLECTION)
    .dropIndex({ grantCode: 1, major: 1, minor: 1, patch: 1 })
    .catch(() => {})
}
