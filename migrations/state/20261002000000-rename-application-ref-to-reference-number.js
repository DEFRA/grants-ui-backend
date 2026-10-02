const STATE_COLLECTION = 'state__grant_application_state'

const MULTI_APP_INDEX_NAME = 'sbi_1_grantCode_1_applicationRef_1_multi_app'
const LOOKUP_INDEX_NAME = 'sbi_1_grantCode_1_grantVersion_1_applicationRef_1_lookup'
const REF_LOOKUP_INDEX_NAME = 'sbi_1_grantCode_1_applicationRef_1_ref_lookup'

const NEW_MULTI_APP_INDEX_NAME = 'sbi_1_grantCode_1_referenceNumber_1_multi_app'
const NEW_LOOKUP_INDEX_NAME = 'sbi_1_grantCode_1_grantVersion_1_referenceNumber_1_lookup'
const NEW_REF_LOOKUP_INDEX_NAME = 'sbi_1_grantCode_1_referenceNumber_1_ref_lookup'

/**
 * Renames the top-level `applicationRef` field to `referenceNumber`, so the
 * one value that identifies an application (shown to the farmer, sent to GAS
 * as `clientRef`, printed on documents, and stored inside the state payload
 * as the forms-engine-plugin's own `$$__referenceNumber`) has one name in
 * grants-ui-backend's own schema too, rather than a second name introduced
 * only for multi-application routing/locking.
 *
 * Drops and recreates the three indexes added across
 * `20260924000000-multi-application-indexes.js`,
 * `20260930000000-add-application-lookup-index.js` and
 * `20261001000000-add-application-ref-lookup-index.js` on the renamed field,
 * rather than editing those migrations in place (migrate-mongo records
 * applied migrations by filename, so an edited migration never re-runs in an
 * environment where the original already applied).
 *
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const up = async (db) => {
  await db
    .collection(STATE_COLLECTION)
    .updateMany({ applicationRef: { $exists: true } }, { $rename: { applicationRef: 'referenceNumber' } })

  await db
    .collection(STATE_COLLECTION)
    .dropIndex(MULTI_APP_INDEX_NAME)
    .catch(() => {})
  await db
    .collection(STATE_COLLECTION)
    .dropIndex(LOOKUP_INDEX_NAME)
    .catch(() => {})
  await db
    .collection(STATE_COLLECTION)
    .dropIndex(REF_LOOKUP_INDEX_NAME)
    .catch(() => {})

  await db.collection(STATE_COLLECTION).createIndex(
    { sbi: 1, grantCode: 1, referenceNumber: 1 },
    {
      unique: true,
      name: NEW_MULTI_APP_INDEX_NAME,
      partialFilterExpression: { allowMultipleApplications: true }
    }
  )

  await db
    .collection(STATE_COLLECTION)
    .createIndex({ sbi: 1, grantCode: 1, grantVersion: 1, referenceNumber: 1 }, { name: NEW_LOOKUP_INDEX_NAME })

  await db
    .collection(STATE_COLLECTION)
    .createIndex({ sbi: 1, grantCode: 1, referenceNumber: 1 }, { name: NEW_REF_LOOKUP_INDEX_NAME })
}

/**
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const down = async (db) => {
  await db
    .collection(STATE_COLLECTION)
    .updateMany({ referenceNumber: { $exists: true } }, { $rename: { referenceNumber: 'applicationRef' } })

  await db
    .collection(STATE_COLLECTION)
    .dropIndex(NEW_MULTI_APP_INDEX_NAME)
    .catch(() => {})
  await db
    .collection(STATE_COLLECTION)
    .dropIndex(NEW_LOOKUP_INDEX_NAME)
    .catch(() => {})
  await db
    .collection(STATE_COLLECTION)
    .dropIndex(NEW_REF_LOOKUP_INDEX_NAME)
    .catch(() => {})

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
    .createIndex({ sbi: 1, grantCode: 1, grantVersion: 1, applicationRef: 1 }, { name: LOOKUP_INDEX_NAME })

  await db
    .collection(STATE_COLLECTION)
    .createIndex({ sbi: 1, grantCode: 1, applicationRef: 1 }, { name: REF_LOOKUP_INDEX_NAME })
}
