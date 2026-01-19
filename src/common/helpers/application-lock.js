import { config } from '../../config.js'
import { log, LogCodes } from '../helpers/logging/log.js'

export const APPLICATION_LOCK_TTL_MS = config.get('applicationLock.ttlMs')

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
 * @param {number | string} params.grantVersion
 * @param {number | string} params.sbi
 * @param {number | string} params.ownerId - DefraID user ID
 * @returns {Promise<Object|null>} Lock document if acquired, otherwise null
 */
export async function acquireOrRefreshApplicationLock(db, { grantCode, grantVersion, sbi, ownerId }) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + APPLICATION_LOCK_TTL_MS)
  const collection = db.collection('grant-application-locks')

  const sbiStr = String(sbi)
  const ownerIdStr = String(ownerId)
  const grantVersionNum = Number(grantVersion ?? 1)

  if (Number.isNaN(grantVersionNum)) {
    throw new Error('Invalid grantVersion')
  }

  try {
    const result = await collection.findOneAndUpdate(
      {
        grantCode,
        grantVersion: grantVersionNum,
        sbi: sbiStr,
        $or: [
          { expiresAt: { $lte: now } }, // expired
          { ownerId: ownerIdStr } // re-entrant
        ]
      },
      {
        $set: {
          grantCode,
          grantVersion: grantVersionNum,
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

    return result ?? null
  } catch (err) {
    const isMongoError = err?.name?.startsWith('Mongo')
    log(LogCodes.SYSTEM.APPLICATION_LOCK_ACQUISITION_FAILED, {
      sbi: sbiStr,
      ownerId: ownerIdStr,
      grantCode,
      grantVersion: grantVersionNum,
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
 * @param {number | string} params.grantVersion
 * @param {number | string} params.sbi
 * @param {number | string} params.ownerId - DefraID user ID
 * @returns {Promise<boolean>} True if the lock was released, false otherwise
 */
export async function releaseApplicationLock(db, { grantCode, grantVersion, sbi, ownerId }) {
  const sbiStr = String(sbi)
  const ownerIdStr = String(ownerId)
  const grantVersionNum = Number(grantVersion)

  if (Number.isNaN(grantVersionNum)) {
    throw new Error('Invalid grantVersion')
  }

  try {
    const result = await db.collection('grant-application-locks').deleteOne({
      grantCode,
      grantVersion: grantVersionNum,
      sbi: sbiStr,
      ownerId: ownerIdStr
    })

    return result.deletedCount === 1
  } catch (err) {
    const isMongoError = err?.name?.startsWith('Mongo')
    log(LogCodes.SYSTEM.APPLICATION_LOCK_RELEASE_FAILED, {
      sbi: sbiStr,
      ownerId: ownerIdStr,
      grantCode,
      grantVersion: grantVersionNum,
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
