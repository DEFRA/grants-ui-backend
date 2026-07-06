const COLLECTION = 'config__allowlist_entries'

/**
 * Replaces the env-keyed allowlist indexes with env-free equivalents.
 * Environment isolation is now handled by infrastructure — each CDP environment
 * has its own MongoDB instance, so the env field is redundant in documents and indexes.
 *
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const up = async (db) => {
  const collection = db.collection(COLLECTION)

  await collection.dropIndex({ type: 1, value: 1, env: 1, grantCode: 1 }).catch(() => {})
  await collection.dropIndex({ env: 1, grantCode: 1 }).catch(() => {})

  // Covered index for findGrantCodesByEntry(type, value).
  await collection.createIndex({ type: 1, value: 1, grantCode: 1 })
}

/**
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const down = async (db) => {
  const collection = db.collection(COLLECTION)

  await collection.dropIndex({ type: 1, value: 1, grantCode: 1 }).catch(() => {})

  await collection.createIndex({ type: 1, value: 1, env: 1, grantCode: 1 })
  await collection.createIndex({ env: 1, grantCode: 1 })
}
