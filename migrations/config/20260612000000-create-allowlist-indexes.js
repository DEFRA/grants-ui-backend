const COLLECTION = 'config__allowlist_entries'

/**
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const up = async (db) => {
  // Covered index for findGrantCodesByEntry(type, value, env).
  // distinct('grantCode', { type, value, env }) reads only the index — no
  // document fetches — at any list size.
  await db.collection(COLLECTION).createIndex({ type: 1, value: 1, env: 1, grantCode: 1 })

  // Covered index for findGrantCodesWithAllowlist(env).
  // distinct('grantCode', { env }) reads only the index.
  await db.collection(COLLECTION).createIndex({ env: 1, grantCode: 1 })

  // Index for replaceAllowlistEntries: deleteMany({ grantCode })
  await db.collection(COLLECTION).createIndex({ grantCode: 1 })
}

/**
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const down = async (db) => {
  await db
    .collection(COLLECTION)
    .dropIndex({ type: 1, value: 1, env: 1, grantCode: 1 })
    .catch(() => {})
  await db
    .collection(COLLECTION)
    .dropIndex({ env: 1, grantCode: 1 })
    .catch(() => {})
  await db
    .collection(COLLECTION)
    .dropIndex({ grantCode: 1 })
    .catch(() => {})
}
