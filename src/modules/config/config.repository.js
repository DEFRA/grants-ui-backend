/**
 * Config module — MongoDB data access.
 */

/**
 * @typedef {Object} FormDefinition
 * @property {import('mongodb').ObjectId} [_id]
 * @property {string} grantCode
 * @property {string} id
 * @property {string} title
 * @property {number} major
 * @property {number} minor
 * @property {number} patch
 * @property {string} status
 * @property {Record<string, unknown>} definition
 * @property {Date} updatedAt
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
 * Upserts a form definition keyed on (grantCode, major, minor, patch).
 *
 * @param {Omit<FormDefinition, '_id'>} formDefinition
 * @returns {Promise<import('mongodb').UpdateResult>}
 */
export async function upsertDefinition(formDefinition) {
  const { grantCode, major, minor, patch, ...rest } = formDefinition
  return configDb.collection(COLLECTION).updateOne(
    { grantCode, major, minor, patch },
    {
      $set: { ...rest, grantCode, major, minor, patch }
    },
    { upsert: true }
  )
}

/**
 * Updates only the status (and updatedAt) of an existing version.
 *
 * Used when the broker reports a status change for a version we already store:
 * nothing else about the version can change, so there is no need to re-fetch
 * and re-ingest the full definition.
 *
 * @param {Object} params
 * @param {string} params.grantCode
 * @param {number} params.major
 * @param {number} params.minor
 * @param {number} params.patch
 * @param {string} params.status
 * @param {Date} [params.updatedAt]
 * @returns {Promise<import('mongodb').UpdateResult>}
 */
export async function updateDefinitionStatus({ grantCode, major, minor, patch, status, updatedAt }) {
  const set = { status }
  if (updatedAt !== undefined) {
    set.updatedAt = updatedAt
  }
  return configDb.collection(COLLECTION).updateOne({ grantCode, major, minor, patch }, { $set: set })
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

/**
 * Builds the map key identifying an exact semver version of a grant.
 *
 * @param {string} grantCode
 * @param {number} major
 * @param {number} minor
 * @param {number} patch
 * @returns {string}
 */
export function definitionStatusKey(grantCode, major, minor, patch) {
  return `${grantCode}|${major}|${minor}|${patch}`
}

/**
 * Batch-loads the stored status for every version of the given grants in a
 * single query.
 *
 * Returns a map keyed by {@link definitionStatusKey} so callers can look up the
 * current status of a version without issuing a query per version.
 *
 * @param {string[]} grantCodes
 * @returns {Promise<Map<string, string>>}
 */
export async function getDefinitionStatuses(grantCodes) {
  const statuses = new Map()
  if (!grantCodes.length) {
    return statuses
  }

  const docs = await configDb
    .collection(COLLECTION)
    .find({ grantCode: { $in: grantCodes } }, { projection: { grantCode: 1, major: 1, minor: 1, patch: 1, status: 1 } })
    .toArray()

  for (const doc of docs) {
    statuses.set(definitionStatusKey(doc.grantCode, doc.major, doc.minor, doc.patch), doc.status)
  }

  return statuses
}
