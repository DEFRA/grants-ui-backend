import { config } from '../../config.js'

export const LOCK_TTL_MS = config.get('applicationLock.ttlMs')

/**
 * Builds a deterministic lock identifier for an application.
 *
 * @param {string} grantCode - Grant scheme code
 * @param {number} grantVersion - Grant scheme version
 * @param {string} sbi - Single Business Identifier
 * @returns {string} Application lock identifier
 */
export function getApplicationLockId(grantCode, grantVersion, sbi) {
  return `app-lock:${grantCode}:${grantVersion}:${sbi}`
}

/**
 * Attempts to acquire an existing lock if:
 *  - the lock has expired, or
 *  - the lock is already owned by the same user (re-entrant access).
 *
 * This operation is atomic and does not create new lock documents.
 *
 * @param {import('mongodb').Collection} collection - MongoDB lock collection
 * @param {Object} params
 * @param {string} params.grantCode
 * @param {number} params.grantVersion
 * @param {string} params.sbi
 * @param {string} params.ownerId - DefraID user ID
 * @param {Object} timing
 * @param {Date} timing.now
 * @param {Date} timing.expiresAt
 * @returns {Promise<Object|null>} The updated lock document, or null if not acquirable
 */
async function tryAcquireExistingLock(collection, { grantCode, grantVersion, sbi, ownerId }, { now, expiresAt }) {
  const result = await collection.findOneAndUpdate(
    {
      grantCode,
      grantVersion,
      sbi,
      $or: [{ expiresAt: { $lte: now } }, { ownerId }]
    },
    {
      $set: {
        ownerId,
        lockedAt: now,
        expiresAt
      }
    },
    { returnDocument: 'after' }
  )

  return result?.value ?? null
}

/**
 * Creates a new application lock.
 *
 * If a concurrent request creates the lock first, a duplicate key
 * error will be raised and translated into a null return value.
 *
 * @param {import('mongodb').Collection} collection - MongoDB lock collection
 * @param {Object} params
 * @param {string} params.grantCode
 * @param {number} params.grantVersion
 * @param {string} params.sbi
 * @param {string} params.ownerId - DefraID user ID
 * @param {Object} timing
 * @param {Date} timing.now
 * @param {Date} timing.expiresAt
 * @returns {Promise<Object|null>} Newly created lock document, or null if already locked
 */
async function createNewLock(collection, { grantCode, grantVersion, sbi, ownerId }, { now, expiresAt }) {
  try {
    const insertResult = await collection.insertOne({
      grantCode,
      grantVersion,
      sbi,
      ownerId,
      lockedAt: now,
      expiresAt
    })

    return {
      _id: insertResult.insertedId,
      grantCode,
      grantVersion,
      sbi,
      ownerId,
      lockedAt: now,
      expiresAt
    }
  } catch (err) {
    if (err.code === 11000) {
      return null
    }
    throw err
  }
}

/**
 * Acquires an exclusive lock for an application.
 *
 * Lock acquisition rules:
 *  - Only one user may hold a lock for a given application at a time
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
export async function acquireApplicationLock(db, { grantCode, grantVersion, sbi, ownerId }) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS)
  const collection = db.collection('application-locks')

  const existingLock = await tryAcquireExistingLock(
    collection,
    { grantCode, grantVersion, sbi, ownerId },
    { now, expiresAt }
  )

  if (existingLock) {
    return existingLock
  }

  return createNewLock(collection, { grantCode, grantVersion, sbi, ownerId }, { now, expiresAt })
}

/**
 * Extends the expiry time of an existing application lock.
 *
 * The lock will only be refreshed if it is owned by the given user.
 *
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @param {Object} params
 * @param {string} params.grantCode
 * @param {number} params.grantVersion
 * @param {string} params.sbi
 * @param {string} params.ownerId - DefraID user ID
 * @returns {Promise<boolean>} True if the lock was refreshed, false otherwise
 */
export async function refreshApplicationLock(db, { grantCode, grantVersion, sbi, ownerId }) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS)

  const result = await db.collection('application-locks').updateOne(
    {
      grantCode,
      grantVersion,
      sbi,
      ownerId
    },
    {
      $set: { expiresAt }
    }
  )

  return result.matchedCount === 1
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
 * @param {string} params.ownerId - DefraID user ID
 * @returns {Promise<void>}
 */
export async function releaseApplicationLock(db, { grantCode, grantVersion, sbi, ownerId }) {
  await db.collection('application-locks').deleteOne({
    grantCode,
    grantVersion,
    sbi,
    ownerId
  })
}
