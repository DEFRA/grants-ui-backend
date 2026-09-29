const STATE_COLLECTION = 'state__grant_application_state'

// Where grants-ui stores the application reference inside the state payload.
const APPLICATION_REF_FIELD = '$$__referenceNumber'

const SINGLE_APP_INDEX_NAME = 'sbi_1_grantCode_1_grantVersion_1_single_app'
const MULTI_APP_INDEX_NAME = 'sbi_1_grantCode_1_applicationRef_1_multi_app'
const LEGACY_INDEX_NAME = 'sbi_1_grantCode_1_grantVersion_1'

/**
 * Replaces the unconditional unique index on `(sbi, grantCode, grantVersion)`
 * with two partial unique indexes, so a scheme's `allowMultipleApplications`
 * flag determines which uniqueness guarantee applies to its documents:
 *
 *  - `allowMultipleApplications: false` (standard schemes, including every
 *    pre-existing document once backfilled below) stay unique on
 *    `(sbi, grantCode, grantVersion)` — identical to the previous constraint.
 *  - `allowMultipleApplications: true` are unique on
 *    `(sbi, grantCode, applicationRef)` instead, so one SBI may hold several
 *    applications for the same grant, one per applicationRef.
 *
 * `grantVersion` is deliberately absent from the multi-application key. An
 * application is identified by its `applicationRef`; its version is a mutable
 * attribute upgraded in place as new definitions are published (see
 * `updateApplicationStateVersion`). Including it would let the same
 * application exist once per version, splitting it across records after a
 * version bump.
 *
 * `partialFilterExpression` supports only exact-match/`$exists` (not `$ne`),
 * so every document must carry an explicit `allowMultipleApplications`
 * boolean for these indexes to classify it. Pre-existing documents are
 * backfilled with `false` here rather than left to lazy backfill on next save.
 *
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const up = async (db) => {
  await db
    .collection(STATE_COLLECTION)
    .updateMany({ allowMultipleApplications: { $exists: false } }, { $set: { allowMultipleApplications: false } })

  // Promote the applicationRef grants-ui already stores inside the opaque
  // state payload to a top-level, indexable field. Documents last saved
  // before this release only carry it nested, and the multi-application key
  // matches on the top-level field: without this, enabling
  // allowMultipleApplications for a grant would strand those in-flight
  // applications and start a fresh document on the applicant's next save.
  // $getField is required because the field name begins with '$'; $literal
  // stops that name being read as a variable reference.
  await db.collection(STATE_COLLECTION).updateMany({ applicationRef: { $exists: false } }, [
    {
      $set: { applicationRef: { $getField: { input: '$state', field: { $literal: APPLICATION_REF_FIELD } } } }
    }
  ])

  await db.collection(STATE_COLLECTION).createIndex(
    { sbi: 1, grantCode: 1, grantVersion: 1 },
    {
      unique: true,
      name: SINGLE_APP_INDEX_NAME,
      partialFilterExpression: { allowMultipleApplications: false }
    }
  )

  await db.collection(STATE_COLLECTION).createIndex(
    { sbi: 1, grantCode: 1, applicationRef: 1 },
    {
      unique: true,
      name: MULTI_APP_INDEX_NAME,
      partialFilterExpression: { allowMultipleApplications: true }
    }
  )

  await db
    .collection(STATE_COLLECTION)
    .dropIndex(LEGACY_INDEX_NAME)
    .catch(() => {})
}

/**
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const down = async (db) => {
  await db
    .collection(STATE_COLLECTION)
    .createIndex({ sbi: 1, grantCode: 1, grantVersion: 1 }, { unique: true, name: LEGACY_INDEX_NAME })

  await db
    .collection(STATE_COLLECTION)
    .dropIndex(SINGLE_APP_INDEX_NAME)
    .catch(() => {})
  await db
    .collection(STATE_COLLECTION)
    .dropIndex(MULTI_APP_INDEX_NAME)
    .catch(() => {})
}
