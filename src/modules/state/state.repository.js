/**
 * State module — MongoDB data access.
 */

/**
 * @typedef {Object} ApplicationLock
 * @property {import('mongodb').ObjectId} _id
 * @property {string} grantCode
 * @property {string} grantVersion
 * @property {string} sbi
 * @property {string} ownerId
 * @property {Date} lockedAt
 * @property {Date} expiresAt
 */

/**
 * @typedef {Object} ApplicationState
 * @property {import('mongodb').ObjectId} _id
 * @property {string} sbi
 * @property {string} grantCode
 * @property {string} grantVersion
 * @property {number} [pinnedMajor]
 * @property {number} [major]
 * @property {number} [minor]
 * @property {number} [patch]
 * @property {Record<string, unknown>} state
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */

/**
 * @typedef {Object} Submission
 * @property {import('mongodb').ObjectId} _id
 * @property {string} sbi
 * @property {string} grantCode
 * @property {string} grantVersion
 * @property {string} referenceNumber
 * @property {Date} [submittedAt]
 */

import { config } from '../../config.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'
import { normaliseGrantVersion } from './grant-version.js'

const LOCKS_COLLECTION = 'state__grant_application_locks'
const STATE_COLLECTION = 'state__grant_application_state'
const SUBMISSIONS_COLLECTION = 'state__grant_application_submissions'
const IGNORE_ELEVEN_THOUSAND = 11000

export const APPLICATION_LOCK_TTL_MS = config.get('applicationLock.ttlMs')

/** @type {import('mongodb').Db} */
let stateDb

/**
 * Initialises the repository with the state database instance.
 *
 * Called once at startup in `server.js` after the mongoDb plugin has registered.
 *
 * @param {import('mongodb').Db} db
 */
export function initStateRepository(db) {
  stateDb = db
}

/**
 * Acquires or refreshes an exclusive lock for an application for a given organisation.
 *
 * Lock acquisition rules:
 *  - Only one user from the same organisation may hold a lock for a given application at a time
 *  - Expired locks may be taken over
 *  - The same user may re-acquire (refresh) their own lock
 *  - If another active user holds the lock, null is returned
 *
 * @param {{ grantCode: string, grantVersion: string, sbi: number|string, ownerId: number|string }} params
 * @returns {Promise<ApplicationLock|null>}
 */
export async function acquireOrRefreshApplicationLock({ grantCode, grantVersion, sbi, ownerId }) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + APPLICATION_LOCK_TTL_MS)
  const collection = stateDb.collection(LOCKS_COLLECTION)

  const sbiStr = String(sbi)
  const ownerIdStr = String(ownerId)
  const { grantVersion: grantVersionStr } = normaliseGrantVersion(grantVersion)

  try {
    const result = await collection.findOneAndUpdate(
      {
        grantCode,
        grantVersion: grantVersionStr,
        sbi: sbiStr,
        $or: [
          { expiresAt: { $lte: now } }, // expired
          { ownerId: ownerIdStr } // re-entrant
        ]
      },
      {
        $set: {
          grantCode,
          grantVersion: grantVersionStr,
          sbi: sbiStr,
          ownerId: ownerIdStr,
          lockedAt: now,
          expiresAt
        }
      },
      {
        upsert: true,
        returnDocument: 'after'
      }
    )

    if (result) {
      log(LogCodes.APPLICATION_LOCK.ACQUIRED, {
        sbi: sbiStr,
        ownerId: ownerIdStr,
        grantCode,
        grantVersion: grantVersionStr
      })
    }

    return result ?? null
  } catch (err) {
    const isMongoError = err?.name?.startsWith('Mongo')
    log(LogCodes.APPLICATION_LOCK.ACQUISITION_FAILED, {
      sbi: sbiStr,
      ownerId: ownerIdStr,
      grantCode,
      grantVersion: grantVersionStr,
      errorName: err.name,
      errorMessage: err.message,
      errorReason: err.reason,
      errorCode: err.code,
      isMongoError,
      stack: err.stack?.split('\n')[0]
    })

    if (err.code === IGNORE_ELEVEN_THOUSAND) {
      return null
    }
    throw err
  }
}

/**
 * Releases an application lock held by the given user.
 *
 * @param {{ grantCode: string, grantVersion: string, sbi: number|string, ownerId: number|string }} params
 * @returns {Promise<boolean>}
 */
export async function releaseApplicationLock({ grantCode, grantVersion, sbi, ownerId }) {
  const sbiStr = String(sbi)
  const ownerIdStr = String(ownerId)
  const { grantVersion: grantVersionStr } = normaliseGrantVersion(grantVersion)

  try {
    const result = await stateDb.collection(LOCKS_COLLECTION).deleteOne({
      grantCode,
      grantVersion: grantVersionStr,
      sbi: sbiStr,
      ownerId: ownerIdStr
    })

    const deleted = result.deletedCount === 1

    if (deleted) {
      log(LogCodes.APPLICATION_LOCK.RELEASED, {
        sbi: sbiStr,
        ownerId: ownerIdStr,
        grantCode,
        grantVersion: grantVersionStr
      })
    }

    return deleted
  } catch (err) {
    const isMongoError = err?.name?.startsWith('Mongo')
    log(LogCodes.APPLICATION_LOCK.RELEASE_FAILED, {
      sbi: sbiStr,
      ownerId: ownerIdStr,
      grantCode,
      grantVersion: grantVersionStr,
      errorName: err.name,
      errorMessage: err.message,
      errorReason: err.reason,
      errorCode: err.code,
      isMongoError,
      stack: err.stack?.split('\n')[0]
    })
    throw err
  }
}

/**
 * Releases all application locks held by the given user.
 *
 * @param {{ ownerId: number|string }} params
 * @returns {Promise<number>}
 */
export async function releaseAllApplicationLocksForOwner({ ownerId }) {
  const ownerIdStr = String(ownerId)

  try {
    const result = await stateDb.collection(LOCKS_COLLECTION).deleteMany({
      ownerId: ownerIdStr
    })

    if (result.deletedCount > 0) {
      log(LogCodes.APPLICATION_LOCKS.RELEASED, {
        ownerId,
        releasedCount: result.deletedCount
      })
    }

    return result.deletedCount ?? 0
  } catch (err) {
    const isMongoError = err?.name?.startsWith('Mongo')
    log(LogCodes.APPLICATION_LOCKS.RELEASE_FAILED, {
      ownerId: ownerIdStr,
      errorName: err.name,
      errorMessage: err.message,
      errorReason: err.reason,
      errorCode: err.code,
      isMongoError,
      stack: err.stack?.split('\n')[0]
    })
    throw err
  }
}

/**
 * Saves (upserts) application state.
 *
 * @param {{ sbi: number|string, grantCode: string, grantVersion: string, state: Record<string, unknown> }} params
 * @returns {Promise<import('mongodb').UpdateResult>}
 */
export async function saveApplicationState({ sbi, grantCode, grantVersion, state }) {
  const { grantVersion: grantVersionStr, pinnedMajor, major, minor, patch } = normaliseGrantVersion(grantVersion)

  const updateDoc = {
    $set: {
      state: {
        ...state,
        ...(state?.submittedAt ? { submittedAt: new Date(state.submittedAt) } : {})
      }
    },
    $currentDate: { updatedAt: true },
    $setOnInsert: { createdAt: new Date(), pinnedMajor, major, minor, patch }
  }

  try {
    return await stateDb
      .collection(STATE_COLLECTION)
      .updateOne({ sbi, grantCode, grantVersion: grantVersionStr }, updateDoc, { upsert: true })
  } catch (err) {
    const isMongoError = err?.name?.startsWith('Mongo')
    log(LogCodes.STATE.STATE_SAVE_FAILED, {
      sbi,
      grantCode,
      grantVersion,
      errorName: err.name,
      errorMessage: err.message,
      errorReason: err.reason,
      errorCode: err.code,
      isMongoError,
      stack: err.stack?.split('\n')[0]
    })
    throw err
  }
}

/**
 * Retrieves application state.
 *
 * @param {{ sbi: string, grantCode: string, grantVersion: string }} params
 * @returns {Promise<ApplicationState|null>}
 */
export async function getApplicationState({ sbi, grantCode, grantVersion }) {
  try {
    return await stateDb.collection(STATE_COLLECTION).findOne({ sbi, grantCode, grantVersion })
  } catch (err) {
    const isMongoError = err?.name?.startsWith('Mongo')
    log(LogCodes.STATE.STATE_RETRIEVE_FAILED, {
      sbi,
      grantCode,
      grantVersion,
      errorName: err.name,
      errorMessage: err.message,
      errorReason: err.reason,
      errorCode: err.code,
      isMongoError,
      stack: err.stack?.split('\n')[0]
    })
    throw err
  }
}

/**
 * Deletes application state.
 *
 * @param {{ sbi: string, grantCode: string, grantVersion: string }} params
 * @returns {Promise<ApplicationState|null>} The deleted document, or null if not found
 */
export async function deleteApplicationState({ sbi, grantCode, grantVersion }) {
  try {
    return await stateDb.collection(STATE_COLLECTION).findOneAndDelete({ sbi, grantCode, grantVersion })
  } catch (err) {
    const isMongoError = err?.name?.startsWith('Mongo')
    log(LogCodes.STATE.STATE_DELETE_FAILED, {
      sbi,
      grantCode,
      grantVersion,
      errorName: err.name,
      errorMessage: err.message,
      errorReason: err.reason,
      errorCode: err.code,
      isMongoError,
      stack: err.stack?.split('\n')[0]
    })
    throw err
  }
}

/**
 * Patches application state (updates applicationStatus field).
 *
 * @param {{ sbi: string, grantCode: string, grantVersion: string, applicationStatus: string }} params
 * @returns {Promise<ApplicationState|null>} Updated document, or null if not found
 */
export async function patchApplicationState({ sbi, grantCode, grantVersion, applicationStatus }) {
  try {
    return await stateDb.collection(STATE_COLLECTION).findOneAndUpdate(
      { sbi, grantCode, grantVersion },
      {
        $set: {
          'state.applicationStatus': applicationStatus
        },
        $currentDate: { updatedAt: true }
      },
      { returnDocument: 'after', upsert: false }
    )
  } catch (err) {
    const isMongoError = err?.name?.startsWith('Mongo')
    log(LogCodes.STATE.STATE_PATCH_FAILED, {
      sbi,
      grantCode,
      grantVersion,
      errorName: err.name,
      errorMessage: err.message,
      errorReason: err.reason,
      errorCode: err.code,
      isMongoError,
      stack: err.stack?.split('\n')[0]
    })
    throw err
  }
}

/**
 * Retrieves the highest-semver application state for an (sbi, grantCode) pair.
 *
 * Used when the caller does not know the exact grantVersion.
 *
 * @param {{ sbi: string, grantCode: string }} params
 * @returns {Promise<ApplicationState|null>}
 */
export async function getLatestApplicationStateForGrant({ sbi, grantCode }) {
  try {
    return await stateDb
      .collection(STATE_COLLECTION)
      .find({ sbi, grantCode })
      .sort({ major: -1, minor: -1, patch: -1 })
      .limit(1)
      .next()
  } catch (err) {
    const isMongoError = err?.name?.startsWith('Mongo')
    log(LogCodes.STATE.STATE_RETRIEVE_FAILED, {
      sbi,
      grantCode,
      errorName: err.name,
      errorMessage: err.message,
      errorReason: err.reason,
      errorCode: err.code,
      isMongoError,
      stack: err.stack?.split('\n')[0]
    })
    throw err
  }
}

/**
 * Updates the version fields of an existing application state document.
 *
 * `pinnedMajor` is intentionally left untouched so the major stays pinned.
 *
 * @param {{ _id: import('mongodb').ObjectId, grantVersion: string, major: number, minor: number, patch: number }} params
 * @returns {Promise<ApplicationState|null>} Updated document, or null if not found
 */
export async function updateApplicationStateVersion({ _id, grantVersion, major, minor, patch }) {
  try {
    return await stateDb.collection(STATE_COLLECTION).findOneAndUpdate(
      { _id },
      {
        $set: { grantVersion, major, minor, patch },
        $currentDate: { updatedAt: true }
      },
      { returnDocument: 'after' }
    )
  } catch (err) {
    const isMongoError = err?.name?.startsWith('Mongo')
    log(LogCodes.STATE.STATE_SAVE_FAILED, {
      grantCode: undefined,
      grantVersion,
      errorName: err.name,
      errorMessage: err.message,
      errorReason: err.reason,
      errorCode: err.code,
      isMongoError,
      stack: err.stack?.split('\n')[0]
    })
    throw err
  }
}

/**
 * Inserts a submission record.
 *
 * @param {Omit<Submission, '_id'>} submission
 * @returns {Promise<import('mongodb').InsertOneResult>}
 */
export async function insertSubmission(submission) {
  try {
    return await stateDb.collection(SUBMISSIONS_COLLECTION).insertOne(submission)
  } catch (err) {
    const isMongoError = err?.name?.startsWith('Mongo')
    log(LogCodes.SUBMISSIONS.SUBMISSIONS_ADD_FAILED, {
      ...submission,
      errorName: err.name,
      errorMessage: err.message,
      errorReason: err.reason,
      errorCode: err.code,
      isMongoError,
      stack: err.stack?.split('\n')[0]
    })
    throw err
  }
}

/**
 * Retrieves submission records matching the given filter.
 *
 * @param {Partial<Submission>} filter
 * @returns {Promise<Submission[]>}
 */
export async function findSubmissions(filter) {
  try {
    return await stateDb.collection(SUBMISSIONS_COLLECTION).find(filter).sort({ submittedAt: -1 }).toArray()
  } catch (err) {
    const isMongoError = err?.name?.startsWith('Mongo')
    log(LogCodes.SUBMISSIONS.SUBMISSIONS_RETRIEVE_FAILED, {
      ...filter,
      errorName: err.name,
      errorMessage: err.message,
      errorReason: err.reason,
      errorCode: err.code,
      isMongoError,
      stack: err.stack?.split('\n')[0]
    })
    throw err
  }
}
