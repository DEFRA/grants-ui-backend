/**
 * Config module — MongoDB data access.
 */

/**
 * @typedef {Object} FormDefinition
 * @property {import('mongodb').ObjectId} _id
 * @property {string} grantCode
 * @property {number} major
 * @property {number} minor
 * @property {number} patch
 * @property {Record<string, unknown>} definition
 */

import { FORM_DEFINITION_STATUS } from './config.constants.js'

const COLLECTION = 'form-definitions'

/** @type {import('mongodb').Db} */
let configDb

/**
 * Initialises the repository with the config database instance.
 *
 * Called once at startup in `server.js` after the mongoDb plugin has registered.
 *
 * @param {import('mongodb').Db} db
 */
export function initConfigRepository(db) {
  configDb = db
}

/**
 * Creates the indexes required by the config module.
 *
 * Called by the `mongoDb` plugin on startup via `options.createIndexes`.
 *
 * @param {import('mongodb').Db} db
 */
export async function createConfigIndexes(db) {
  // Compound index used by resolveLatestVersion and resolveLatestVersionWithinMajor
  await db
    .collection(COLLECTION)
    .createIndex({ grantCode: 1, status: 1, major: -1, minor: -1, patch: -1 }, { unique: true })

  // Exact-match index used by getDefinition
  await db.collection(COLLECTION).createIndex({ grantCode: 1, major: 1, minor: 1, patch: 1 }, { unique: true })
}

/**
 * Returns the latest live version for a grant.
 *
 * @param {string} grantCode
 * @returns {Promise<FormDefinition|null>}
 */
export async function resolveLatestVersion(grantCode) {
  return configDb
    .collection(COLLECTION)
    .find({ grantCode, status: FORM_DEFINITION_STATUS.ACTIVE })
    .sort({ major: -1, minor: -1, patch: -1 })
    .limit(1)
    .next()
}

/**
 * Returns the latest live version within a pinned major for a grant.
 *
 * @param {string} grantCode
 * @param {number} pinnedMajor
 * @returns {Promise<FormDefinition|null>}
 */
export async function resolveLatestVersionWithinMajor(grantCode, pinnedMajor) {
  return configDb
    .collection(COLLECTION)
    .find({ grantCode, status: FORM_DEFINITION_STATUS.ACTIVE, major: pinnedMajor })
    .sort({ minor: -1, patch: -1 })
    .limit(1)
    .next()
}

/**
 * Returns the form definition for an exact semver version.
 *
 * No status filtering is applied, so the caller will get either an `active` or `draft` definition.
 *
 * @param {string} grantCode
 * @param {number} major
 * @param {number} minor
 * @param {number} patch
 * @returns {Promise<FormDefinition|null>}
 */
export async function getDefinition(grantCode, major, minor, patch) {
  return configDb.collection(COLLECTION).find({ grantCode, major, minor, patch }).limit(1).next()
}
