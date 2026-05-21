/**
 * Config module — MongoDB data access.
 */
import { FORM_DEFINITION_STATUS } from './config.constants.js'

const COLLECTION = 'form-definitions'

/**
 * Creates the indexes required by the config module.
 *
 * Called by the `mongoDb` plugin on startup via `options.createIndexes`.
 *
 * @param {import('mongodb').Db} db
 */
export async function createConfigIndexes(db) {
  // Compound index used by resolveLatestVersion and resolveLatestVersionWithinMajor
  await db.collection(COLLECTION).createIndex({ grantCode: 1, status: 1, major: -1, minor: -1, patch: -1 })

  // Exact-match index used by getDefinition
  await db.collection(COLLECTION).createIndex({ grantCode: 1, major: 1, minor: 1, patch: 1 })
}

/**
 * Returns the latest live version for a grant.
 *
 * @param {import('mongodb').Db} db
 * @param {string} grantCode
 */
export async function resolveLatestVersion(db, grantCode) {
  return db
    .collection(COLLECTION)
    .find({ grantCode, status: FORM_DEFINITION_STATUS.ACTIVE })
    .sort({ major: -1, minor: -1, patch: -1 })
    .limit(1)
    .next()
}

/**
 * Returns the latest live version within a pinned major for a grant.
 *
 * @param {import('mongodb').Db} db
 * @param {string} grantCode
 * @param {number} pinnedMajor
 */
export async function resolveLatestVersionWithinMajor(db, grantCode, pinnedMajor) {
  return db
    .collection(COLLECTION)
    .find({ grantCode, status: FORM_DEFINITION_STATUS.ACTIVE, major: pinnedMajor })
    .sort({ minor: -1, patch: -1 })
    .limit(1)
    .next()
}

/**
 * Returns the form definition for an exact semver version.
 *
 * @param {import('mongodb').Db} db
 * @param {string} grantCode
 * @param {number} major
 * @param {number} minor
 * @param {number} patch
 */
export async function getDefinition(db, grantCode, major, minor, patch) {
  return db.collection(COLLECTION).find({ grantCode, major, minor, patch }).limit(1).next()
}
