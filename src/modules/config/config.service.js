/**
 * Config module — business logic
 */

import {
  resolveLatestVersion as repoResolveLatestVersion,
  resolveLatestVersionWithinMajor as repoResolveLatestVersionWithinMajor,
  getDefinition as repoGetDefinition
} from './config.repository.js'

/**
 * Returns the latest live FormDefinition for a grant.
 *
 * @param {import('mongodb').Db} db
 * @param {string} grantCode
 */
export function resolveLatestVersion(db, grantCode) {
  return repoResolveLatestVersion(db, grantCode)
}

/**
 * Returns the latest live FormDefinition within a pinned major version.
 *
 * @param {import('mongodb').Db} db
 * @param {string} grantCode
 * @param {number} pinnedMajor
 */
export function resolveLatestVersionWithinMajor(db, grantCode, pinnedMajor) {
  return repoResolveLatestVersionWithinMajor(db, grantCode, pinnedMajor)
}

/**
 * Returns the FormDefinition for an exact semver version.
 *
 * @param {import('mongodb').Db} db
 * @param {string} grantCode
 * @param {number} major
 * @param {number} minor
 * @param {number} patch
 */
export function getDefinition(db, grantCode, major, minor, patch) {
  return repoGetDefinition(db, grantCode, major, minor, patch)
}
