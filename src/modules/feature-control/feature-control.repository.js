/**
 * Feature-control module — MongoDB data access.
 * Index: { name } (unique)
 */

/**
 * @typedef {Object} FeatureControl
 * @property {string} name - upper-case, globally unique feature-control name
 * @property {boolean} value
 * @property {'boolean'} valueType
 * @property {string[]} scopes
 * @property {Date} updatedAt
 */

const COLLECTION = 'config__feature_controls'

/** @type {import('mongodb').Db} */
let featureControlDb

/**
 * Initialises the repository with the config database instance.
 *
 * @param {import('mongodb').Db} db
 */
export function initFeatureControlRepository(db) {
  featureControlDb = db
}

/**
 * Inserts or replaces the stored value for a feature control.
 *
 * @param {Omit<FeatureControl, 'updatedAt'>} featureControl
 * @returns {Promise<void>}
 */
export async function upsertFeatureControl({ name, value, valueType, scopes }) {
  await featureControlDb
    .collection(COLLECTION)
    .updateOne({ name }, { $set: { value, valueType, scopes, updatedAt: new Date() } }, { upsert: true })
}

/**
 * Returns the stored feature control, or null when none has been received.
 *
 * @param {string} name
 * @returns {Promise<Pick<FeatureControl, 'value' | 'valueType'> | null>}
 */
export async function findFeatureControl(name) {
  return featureControlDb.collection(COLLECTION).findOne({ name }, { projection: { _id: 0, value: 1, valueType: 1 } })
}
