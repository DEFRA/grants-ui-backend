/**
 * State service — business logic layer between routes/middleware and the repository.
 * Business rules (e.g. form definition version upgrade on state retrieval, lock policy enforcement) go here.
 */

/**
 * @typedef {import('./state.repository.js').ApplicationLock} ApplicationLock
 * @typedef {import('./state.repository.js').ApplicationState} ApplicationState
 * @typedef {import('./state.repository.js').Submission} Submission
 */

import {
  acquireOrRefreshApplicationLock as repoAcquireOrRefreshApplicationLock,
  releaseApplicationLock as repoReleaseApplicationLock,
  releaseAllApplicationLocksForOwner as repoReleaseAllApplicationLocksForOwner,
  saveApplicationState as repoSaveApplicationState,
  getApplicationState as repoGetApplicationState,
  deleteApplicationState as repoDeleteApplicationState,
  patchApplicationState as repoPatchApplicationState,
  insertSubmission as repoInsertSubmission,
  findSubmissions as repoFindSubmissions
} from './state.repository.js'

export { APPLICATION_LOCK_TTL_MS } from './state.repository.js'

/**
 * Acquires or refreshes an exclusive lock for an application for a given organisation.
 *
 * @param {{ grantCode: string, grantVersion: string, sbi: number|string, ownerId: number|string }} params
 * @returns {Promise<ApplicationLock|null>} Lock document if acquired, otherwise null
 */
export function acquireOrRefreshApplicationLock({ grantCode, grantVersion, sbi, ownerId }) {
  return repoAcquireOrRefreshApplicationLock({ grantCode, grantVersion, sbi, ownerId })
}

/**
 * Releases an application lock held by the given user.
 *
 * @param {{ grantCode: string, grantVersion: string, sbi: number|string, ownerId: number|string }} params
 * @returns {Promise<boolean>} True if the lock was released, false otherwise
 */
export function releaseApplicationLock({ grantCode, grantVersion, sbi, ownerId }) {
  return repoReleaseApplicationLock({ grantCode, grantVersion, sbi, ownerId })
}

/**
 * Releases all application locks held by the given user.
 *
 * @param {{ ownerId: number|string }} params
 * @returns {Promise<number>} Number of locks released
 */
export function releaseAllApplicationLocksForOwner({ ownerId }) {
  return repoReleaseAllApplicationLocksForOwner({ ownerId })
}

/**
 * Saves (upserts) the application state for a given grant and SBI.
 *
 * @param {{ sbi: number|string, grantCode: string, grantVersion: string, state: Record<string, unknown> }} params
 * @returns {Promise<import('mongodb').UpdateResult>}
 */
export function saveApplicationState({ sbi, grantCode, grantVersion, state }) {
  return repoSaveApplicationState({ sbi, grantCode, grantVersion, state })
}

/**
 * Retrieves the application state for a given grant and SBI.
 *
 * @param {{ sbi: number|string, grantCode: string, grantVersion: string }} params
 * @returns {Promise<ApplicationState|null>}
 */
export function getApplicationState({ sbi, grantCode, grantVersion }) {
  return repoGetApplicationState({ sbi, grantCode, grantVersion })
}

/**
 * Deletes the application state for a given grant and SBI.
 *
 * @param {{ sbi: number|string, grantCode: string, grantVersion: string }} params
 * @returns {Promise<ApplicationState|null>} The deleted document, or null if not found
 */
export function deleteApplicationState({ sbi, grantCode, grantVersion }) {
  return repoDeleteApplicationState({ sbi, grantCode, grantVersion })
}

/**
 * Applies a partial update to the application state for a given grant and SBI.
 *
 * @param {{ sbi: number|string, grantCode: string, grantVersion: string, applicationStatus: string }} params
 * @returns {Promise<ApplicationState|null>} Updated document, or null if not found
 */
export function patchApplicationState({ sbi, grantCode, grantVersion, applicationStatus }) {
  return repoPatchApplicationState({ sbi, grantCode, grantVersion, applicationStatus })
}

/**
 * Records a submission for a given grant application.
 *
 * @param {Omit<Submission, '_id'>} submission
 * @returns {Promise<import('mongodb').InsertOneResult>}
 */
export function insertSubmission(submission) {
  return repoInsertSubmission(submission)
}

/**
 * Retrieves submission records matching the given filter.
 *
 * @param {Partial<Submission>} filter
 * @returns {Promise<Submission[]>}
 */
export function findSubmissions(filter) {
  return repoFindSubmissions(filter)
}
