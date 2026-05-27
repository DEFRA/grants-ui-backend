/**
 * Config service — business logic layer between routes and the repository.
 * Business rules (e.g. resolving the correct form definition version to serve based on application state) go here.
 */

/**
 * @typedef {import('./config.repository.js').FormDefinition} FormDefinition
 */

import {
  resolveLatestVersion as repoResolveLatestVersion,
  resolveLatestVersionWithinMajor as repoResolveLatestVersionWithinMajor,
  getDefinition as repoGetDefinition
} from './config.repository.js'

/**
 * Returns the latest live FormDefinition for a grant.
 *
 * @param {string} grantCode
 * @returns {Promise<FormDefinition|null>}
 */
export function resolveLatestVersion(grantCode) {
  return repoResolveLatestVersion(grantCode)
}

/**
 * Returns the latest live FormDefinition within a pinned major version.
 *
 * @param {string} grantCode
 * @param {number} pinnedMajor
 * @returns {Promise<FormDefinition|null>}
 */
export function resolveLatestVersionWithinMajor(grantCode, pinnedMajor) {
  return repoResolveLatestVersionWithinMajor(grantCode, pinnedMajor)
}

/**
 * Returns the FormDefinition for an exact semver version.
 *
 * @param {string} grantCode
 * @param {number} major
 * @param {number} minor
 * @param {number} patch
 * @returns {Promise<FormDefinition|null>}
 */
export function getDefinition(grantCode, major, minor, patch) {
  return repoGetDefinition(grantCode, major, minor, patch)
}
