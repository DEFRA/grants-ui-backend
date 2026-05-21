/**
 * State module — MongoDB data access.
 */

/**
 * Creates the indexes required by the state module.
 *
 * Called by the `mongoDb` plugin on startup via `options.createIndexes`.
 *
 * @param {import('mongodb').Db} db
 */
export async function createStateIndexes(db) {
  await db.collection('grant-application-locks').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  await db
    .collection('grant-application-locks')
    .createIndex({ grantCode: 1, grantVersion: 1, sbi: 1 }, { unique: true })

  await db
    .collection('grant-application-state')
    .createIndex({ sbi: 1, grantCode: 1, grantVersion: 1 }, { unique: true })

  await db
    .collection('grant_application_submissions')
    .createIndex({ sbi: 1, grantCode: 1, grantVersion: 1, referenceNumber: 1 }, { unique: true })
}
