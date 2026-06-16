/**
 * Allowlist module — MongoDB data access.
 *
 * One document per (grantCode, env, type, value). Normalised so every lookup
 * is O(log n) via a covered compound index — MongoDB never touches the
 * documents themselves, only the index — regardless of list size.
 *
 * Index: { type, value, env, grantCode }
 *   - type  : low cardinality prefix ('crn' | 'sbi') — narrows the scan quickly
 *   - value : the actual CRN/SBI string — highly selective
 *   - env   : environment key — further narrows
 *   - grantCode : included last so distinct('grantCode', …) is fully covered
 *
 * The same index (prefix { env, grantCode }) also covers findGrantCodesWithAllowlist.
 * A second index { env, grantCode } is added for that query alone.
 */

/**
 * @typedef {'crn' | 'sbi'} AllowlistEntryType
 *
 * @typedef {Object} AllowlistEntry
 * @property {string} grantCode
 * @property {string} env
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
 * given type, value and env.
 *
 * Backed by the covered index { type, value, env, grantCode } — no document
 * reads, index-only scan.
 *
 * @param {AllowlistEntryType} type
 * @param {string} value
 * @param {string} env
 * @returns {Promise<string[]>}
 */
export async function findGrantCodesByEntry(type, value, env) {
  return allowlistDb.collection(COLLECTION).distinct('grantCode', { type, value, env })
}

/**
 * Returns all distinct grantCodes that have any entries for the given env.
 * Used to distinguish "grant has no allowlist" (allow all) from "grant has an
 * allowlist but this user is not on it" (deny).
 *
 * Backed by the covered index { env, grantCode } — index-only scan.
 *
 * @param {string} env
 * @returns {Promise<string[]>}
 */
export async function findGrantCodesWithAllowlist(env) {
  return allowlistDb.collection(COLLECTION).distinct('grantCode', { env })
}
