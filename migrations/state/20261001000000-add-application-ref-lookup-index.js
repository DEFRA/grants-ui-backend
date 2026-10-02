const STATE_COLLECTION = 'state__grant_application_state'

const REF_LOOKUP_INDEX_NAME = 'sbi_1_grantCode_1_applicationRef_1_ref_lookup'

/**
 * Adds a plain index for looking an application up by its reference.
 *
 * A reference identifies an application on its own, so reads that carry one
 * match without `grantVersion`: a version is upgraded in place as new
 * definitions are published, and pinning a caller-supplied one alongside the
 * reference would miss the application whenever the two disagree.
 *
 * `20260930000000-add-application-lookup-index.js` covers that query only as
 * a partial prefix — it seeks on `(sbi, grantCode)` then filters the
 * reference across every application the SBI holds for the grant. This index
 * makes it a point lookup.
 *
 * The `multi_app` index has the same key but is partial, filtered on
 * `allowMultipleApplications: true`, so MongoDB cannot use it for reads that
 * do not name the flag — which none do.
 *
 * Kept as a separate migration: migrate-mongo records applied migrations by
 * filename (`useFileHash: false`), so editing one that has already run in an
 * environment would never re-execute there.
 *
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const up = async (db) => {
  await db
    .collection(STATE_COLLECTION)
    .createIndex({ sbi: 1, grantCode: 1, applicationRef: 1 }, { name: REF_LOOKUP_INDEX_NAME })
}

/**
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const down = async (db) => {
  await db
    .collection(STATE_COLLECTION)
    .dropIndex(REF_LOOKUP_INDEX_NAME)
    .catch(() => {})
}
