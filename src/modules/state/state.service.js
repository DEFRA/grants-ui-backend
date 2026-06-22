/**
 * State service — business logic layer between routes/middleware and the repository.
 * Business rules (e.g. form definition version upgrade on state retrieval, lock policy enforcement) go here.
 */

/**
 * @typedef {import('./state.repository.js').ApplicationLock} ApplicationLock
 * @typedef {import('./state.repository.js').ApplicationState} ApplicationState
 * @typedef {import('./state.repository.js').Submission} Submission
 * @typedef {import('../config/config.repository.js').FormDefinition} FormDefinition
 */

import Boom from '@hapi/boom'
import {
  acquireOrRefreshApplicationLock as repoAcquireOrRefreshApplicationLock,
  releaseApplicationLock as repoReleaseApplicationLock,
  releaseAllApplicationLocksForOwner as repoReleaseAllApplicationLocksForOwner,
  saveApplicationState as repoSaveApplicationState,
  getApplicationState as repoGetApplicationState,
  deleteApplicationState as repoDeleteApplicationState,
  patchApplicationState as repoPatchApplicationState,
  insertSubmission as repoInsertSubmission,
  findSubmissions as repoFindSubmissions,
  getLatestApplicationStateForGrant as repoGetLatestApplicationStateForGrant,
  updateApplicationStateVersion as repoUpdateApplicationStateVersion
} from './state.repository.js'
import { resolveLatestVersion, resolveLatestVersionWithinMajor } from '../config/config.service.js'

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

/**
 * Acquires (or refreshes) the application lock for the resolved grantVersion,
 * throwing `Boom.locked` (HTTP 423) when another owner currently holds it.
 *
 * @param {{ grantCode: string, grantVersion: string, sbi: number|string, ownerId: number|string }} params
 * @returns {Promise<void>}
 * @throws {Boom} 423 Locked when the lock is held by another owner
 */
async function acquireLockOrThrow({ grantCode, grantVersion, sbi, ownerId }) {
  const lock = await repoAcquireOrRefreshApplicationLock({ grantCode, grantVersion, sbi, ownerId })
  if (!lock) {
    throw Boom.locked('Another applicant is currently editing this application')
  }
}

/**
 * Resolves the cold-start (no existing state) result for `getStateWithFormDefinition`.
 *
 * Resolves the latest active definition for the grant, acquires the lock against
 * its version, and returns it with `state: null`; the frontend creates the state.
 * No state write occurs.
 *
 * @param {{ grantCode: string, sbi: number|string, ownerId: number|string }} params
 * @returns {Promise<{ definition: FormDefinition, state: null, upgraded: false } | null>}
 *   `null` when no suitable form definition is found
 * @throws {Boom} 423 Locked when another owner holds the lock for the resolved version
 */
async function resolveDefinitionForNewState({ grantCode, sbi, ownerId }) {
  const definition = await resolveLatestVersion(grantCode)
  if (!definition) {
    return null
  }
  const { major, minor, patch } = definition
  const grantVersion = `${major}.${minor}.${patch}`
  await acquireLockOrThrow({ grantCode, grantVersion, sbi, ownerId })
  return { definition, state: null, upgraded: false }
}

/**
 * Returns an application's form definition and its current state together.
 *
 * Orchestrates the state and config domains (config is reached only through its
 * public service API, never its repository) with conditional writes. Because a
 * cold first call cannot yet carry a version-bearing lock token, this endpoint
 * resolves the authoritative grantVersion first and only then acquires/refreshes
 * the application lock against that resolved version (returning 423 on conflict):
 *  - No existing state -> resolve the latest active definition, acquire the lock
 *    against its version, and return it with `state: null`; the frontend creates
 *    the state. No state write occurs.
 *  - Existing state -> resolve the latest active definition within the state's
 *    pinned major, then acquire the lock against the resolved version. If the
 *    resolved version matches the stored `grantVersion`, return the stored state
 *    unchanged (read-only). If it differs, persist the upgraded version fields
 *    and best-effort release the now-orphaned lock on the previous version.
 *
 * The result always carries an `upgraded` flag describing whether a version
 * upgrade was persisted on this call. When `upgraded` is `true`, `fromVersion`
 * and `toVersion` report the previous and new `grantVersion` respectively.
 *
 * When `includeDefinition` is `false`, the caller already holds the form
 * definition locally (e.g. a legacy YAML-sourced form) and only needs the
 * state. In that mode all definition-resolution and version-upgrade work is
 * skipped: the stored state (and its own version) is returned as-is with no
 * `definition` payload, and the lock is acquired against the state's existing
 * version. When no state exists yet, `state` is `null` and no lock is taken.
 *
 * @param {{ sbi: string, grantCode: string, ownerId: number|string, includeDefinition?: boolean }} params
 *   `includeDefinition` defaults to `true`; pass `false` for state-only reads
 * @returns {Promise<{ definition?: FormDefinition, state: ApplicationState | null, upgraded: boolean, fromVersion?: string, toVersion?: string } | null>}
 *   `null` when no suitable form definition is found (only possible when
 *   `includeDefinition` is `true`); `state` is `null` when no state exists yet;
 *   `definition` is omitted when `includeDefinition` is `false`
 * @throws {Boom} 423 Locked when another owner holds the lock for the resolved version
 */
export async function getStateWithFormDefinition({ sbi, grantCode, ownerId, includeDefinition = true }) {
  const existing = await repoGetLatestApplicationStateForGrant({ sbi, grantCode })

  // State-only mode: the caller already has the form definition locally, so skip
  // resolving/serialising a definition and the associated version-upgrade work
  // entirely. Return just the stored state and acquire the lock against its own
  // version. With no state yet there is nothing to lock or upgrade.
  if (!includeDefinition) {
    if (!existing) {
      return { state: null, upgraded: false }
    }
    await acquireLockOrThrow({ grantCode, grantVersion: existing.grantVersion, sbi, ownerId })
    return { state: existing, upgraded: false }
  }

  // No state yet: return the latest definition; the frontend creates the state.
  if (!existing) {
    return resolveDefinitionForNewState({ grantCode, sbi, ownerId })
  }

  // Existing state: resolve the latest definition within its pinned major.
  const pinnedMajor = existing.pinnedMajor ?? existing.major
  const definition = await resolveLatestVersionWithinMajor(grantCode, pinnedMajor)
  if (!definition) {
    return null
  }

  const { major, minor, patch } = definition
  const newGrantVersion = `${major}.${minor}.${patch}`

  // Acquire the lock against the resolved version before any write.
  await acquireLockOrThrow({ grantCode, grantVersion: newGrantVersion, sbi, ownerId })

  // No version change: read-only (most per-request calls land here).
  if (newGrantVersion === existing.grantVersion) {
    return { definition, state: existing, upgraded: false }
  }

  // Version changed: persist the upgrade.
  const state = await repoUpdateApplicationStateVersion({
    _id: existing._id,
    grantVersion: newGrantVersion,
    major,
    minor,
    patch
  })

  // Best-effort release of the now-orphaned lock on the previous version. The
  // new-version lock is already held, so if this fails the old lock simply
  // lingers until its TTL reaps it — never block or fail the upgrade for it.
  try {
    await repoReleaseApplicationLock({
      grantCode,
      grantVersion: existing.grantVersion,
      sbi,
      ownerId
    })
  } catch {
    // Intentionally ignored: the orphaned old-version lock expires via its TTL.
  }

  return {
    definition,
    state,
    upgraded: true,
    fromVersion: existing.grantVersion,
    toVersion: newGrantVersion
  }
}
