const STATE_COLLECTION = 'state__grant_application_state'

const LOOKUP_INDEX_NAME = 'sbi_1_grantCode_1_grantVersion_1_applicationRef_1_lookup'

/**
 * Adds a plain index to serve application-state lookups.
 *
 * The two partial unique indexes added in
 * `20260924000000-multi-application-indexes.js` are each filtered on a single
 * `allowMultipleApplications` value, so neither is guaranteed to contain every
 * document a query could match. Reads do not filter on that flag, so MongoDB
 * will not use either index and every lookup becomes a collection scan.
 *
 * This index covers those reads; the partial indexes are left to enforce
 * uniqueness only.
 *
 * Kept as a separate migration rather than folded into the one above:
 * migrate-mongo records applied migrations by filename (`useFileHash: false`),
 * so editing a migration that has already run in an environment would never
 * re-execute there.
 *
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const up = async (db) => {
  await db
    .collection(STATE_COLLECTION)
    .createIndex({ sbi: 1, grantCode: 1, grantVersion: 1, applicationRef: 1 }, { name: LOOKUP_INDEX_NAME })
}

/**
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const down = async (db) => {
  await db
    .collection(STATE_COLLECTION)
    .dropIndex(LOOKUP_INDEX_NAME)
    .catch(() => {})
}
