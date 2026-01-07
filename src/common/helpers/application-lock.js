import { config } from '../../config.js'
import { log, LogCodes } from '../helpers/logging/log.js'

export const LOCK_TTL_MS = config.get('applicationLock.ttlMs')

/**
 * Acquires or refreshes an exclusive lock for an application for a given organisation.
 *
 * Lock acquisition rules:
 *  - Only one user from the same organisation may hold a lock for a given application at a time
 *  - Expired locks may be taken over
 *  - The same user may re-acquire (refresh) their own lock
 *  - If another active user holds the lock, null is returned
 *
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @param {Object} params
 * @param {string} params.grantCode
 * @param {number} params.grantVersion
 * @param {string} params.sbi
 * @param {string} params.ownerId - DefraID user ID
 * @returns {Promise<Object|null>} Lock document if acquired, otherwise null
 */
export async function acquireOrRefreshApplicationLock(db, { grantCode, grantVersion, sbi, ownerId }) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS)
  const collection = db.collection('grant-application-locks')

  try {
    const result = await collection.findOneAndUpdate(
      {
        grantCode,
        grantVersion,
        sbi,
        $or: [
          { expiresAt: { $lte: now } }, // expired
          { ownerId } // re-entrant
        ]
      },
      {
        $set: {
          grantCode,
          grantVersion,
          sbi,
          ownerId,
          lockedAt: now,
          expiresAt
        }
      },
      {
        upsert: true,
        returnDocument: 'after'
      }
    )

    return result ?? null
  } catch (err) {
    const isMongoError = err?.name?.startsWith('Mongo')
    log(LogCodes.SYSTEM.APPLICATION_LOCK_ACQUISITION_FAILED, {
      sbi,
      ownerId,
      grantCode,
      grantVersion,
      errorName: err.name,
      errorMessage: err.message,
      errorReason: err.reason,
      errorCode: err.code,
      isMongoError,
      stack: err.stack?.split('\n')[0]
    })

    if (err.code === 11000) {
      return null
    }
    throw err
  }
}

/**
 * Releases an application lock held by the given user.
 *
 * If no matching lock exists, this operation is a no-op.
 *
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @param {Object} params
 * @param {string} params.grantCode
 * @param {number} params.grantVersion
 * @param {string} params.sbi
 * @param {number} params.ownerId - DefraID user ID
 * @returns {Promise<boolean>} True if the lock was released, false otherwise
 */
export async function releaseApplicationLock(db, { grantCode, grantVersion, sbi, ownerId }) {
  try {
    const result = await db.collection('grant-application-locks').deleteOne({
      grantCode,
      grantVersion,
      sbi,
      ownerId
    })
    console.log('releaseApplicationLock result:', result)
    return result.deletedCount === 1
  } catch (err) {
    const isMongoError = err?.name?.startsWith('Mongo')
    log(LogCodes.SYSTEM.APPLICATION_LOCK_RELEASE_FAILED, {
      sbi,
      ownerId,
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
