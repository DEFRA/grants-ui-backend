/**
 * Allowlist module — MongoDB data access.
 *
 * One document per (grantCode, type, value). Normalised so every lookup
 * is O(log n) via a covered compound index — MongoDB never touches the
 * documents themselves, only the index — regardless of list size.
 *
 * Index: { type, value, grantCode }
 *   - type      : low cardinality prefix ('crn' | 'sbi') — narrows the scan quickly
 *   - value     : the actual CRN/SBI string — highly selective
 *   - grantCode : included last so distinct('grantCode', …) is fully covered
 *
 * Environment isolation is handled by infrastructure — each CDP environment
 * has its own MongoDB instance, so no env field is needed in documents.
 */

/**
 * @typedef {'crn' | 'sbi'} AllowlistEntryType
 *
 * @typedef {Object} AllowlistEntry
 * @property {string} grantCode
 * @property {AllowlistEntryType} type
 * @property {string} value
 * @property {Date} updatedAt
 */

const COLLECTION = 'config__allowlist_entries'

/** Batch size for insertMany to stay well under the 16MB BSON doc limit */
const INSERT_BATCH_SIZE = 5_000

/** @type {import('mongodb').Db} */
let allowlistDb

/**
 * Initialises the repository with the config database instance.
 *
 * @param {import('mongodb').Db} db
 */
export function initAllowlistRepository(db) {
  allowlistDb = db
}

/**
 * Atomically replaces all allowlist entries for a grant within a single
 * transaction: deletes existing entries then bulk-inserts the new set in
 * batches of INSERT_BATCH_SIZE.
 *
 * @param {string} grantCode
 * @param {AllowlistEntry[]} entries
 * @returns {Promise<void>}
 */
export async function replaceAllowlistEntries(grantCode, entries) {
  const collection = allowlistDb.collection(COLLECTION)
  const session = allowlistDb.client.startSession()

  try {
    await session.withTransaction(async () => {
      await collection.deleteMany({ grantCode }, { session })

      for (let i = 0; i < entries.length; i += INSERT_BATCH_SIZE) {
        await collection.insertMany(entries.slice(i, i + INSERT_BATCH_SIZE), { ordered: false, session })
      }
    })
  } finally {
    await session.endSession()
  }
}

/**
 * Returns all distinct grantCodes that have at least one entry matching the
 * given type and value.
 *
 * Backed by the covered index { type, value, grantCode } — no document
 * reads, index-only scan.
 *
 * @param {AllowlistEntryType} type
 * @param {string} value
 * @returns {Promise<string[]>}
 */
export async function findGrantCodesByEntry(type, value) {
  return allowlistDb.collection(COLLECTION).distinct('grantCode', { type, value })
}

/**
 * Returns a Map of grantCode → { allowAll: boolean } for every grant that has
 * any allowlist entries. Grants absent from the map have no allowlist and are
 * closed to all users.
 *
 * @returns {Promise<Map<string, { allowAll: boolean }>>}
 */
export async function findGrantCodesWithAllowlist() {
  const rows = await allowlistDb
    .collection(COLLECTION)
    .aggregate([{ $group: { _id: '$grantCode', allowAll: { $max: { $eq: ['$type', 'allowAll'] } } } }])
    .toArray()

  return new Map(rows.map(({ _id, allowAll }) => [_id, { allowAll }]))
}
