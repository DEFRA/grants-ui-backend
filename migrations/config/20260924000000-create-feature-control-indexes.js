const COLLECTION = 'config__feature_controls'

/**
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const up = async (db) => {
  // Lookup by name for GET /feature-controls/{name}, and one document per name.
  await db.collection(COLLECTION).createIndex({ name: 1 }, { unique: true })
}

/**
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const down = async (db) => {
  await db
    .collection(COLLECTION)
    .dropIndex({ name: 1 })
    .catch(() => {})
}
