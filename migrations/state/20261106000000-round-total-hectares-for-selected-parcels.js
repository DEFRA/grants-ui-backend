/**
 * `totalHectaresForSelectedParcels` is calculated from the selected parcels.
 * Floating-point arithmetic means the result can carry spurious trailing digits
 * (for example 1.1 + 2.2 = 3.3000000000000003), so stored totals are
 * sometimes not the four-decimal-place hectare value they should be.
 *
 * This migration rounds those totals on draft applications to four decimal
 * places. Submitted applications are left exactly as they were submitted.
 */

const STATE_COLLECTION = 'state__grant_application_state'

// Hectare values are held to four decimal places.
const DECIMAL_PLACES = 4

// The calculated total is stored in both places, so both copies need rounding.
const HECTARES_PATHS = [
  'state.totalHectaresForSelectedParcels',
  'state.additionalAnswers.totalHectaresForSelectedParcels'
]

// A draft is any application that has not yet been submitted: submittedAt is missing or null.
const isDraftApplication = { $in: [{ $type: '$state.submittedAt' }, ['missing', 'null']] }

const roundedHectares = (field) => ({ $round: [field, DECIMAL_PLACES] })

// True when the value is a number carrying more decimal places than hectares are held to.
const needsRounding = (field) => ({
  $and: [{ $isNumber: field }, { $ne: [field, roundedHectares(field)] }]
})

/**
 * Rounds the value at one path on draft applications where it needs
 * rounding. Filtering per path means a document is only updated where the
 * value exists, so a dotted `$set` never creates an empty `additionalAnswers`
 * object.
 *
 * @param collection {import('mongodb').Collection}
 * @param path {string} dotted path to the hectares value
 * @returns {Promise<void>}
 */
const roundHectaresAtPath = async (collection, path) => {
  const field = `$${path}`
  const { matchedCount, modifiedCount } = await collection.updateMany(
    { $expr: { $and: [isDraftApplication, needsRounding(field)] } },
    [{ $set: { [path]: roundedHectares(field) } }]
  )

  console.info(
    `round-total-hectares-for-selected-parcels: path=${path}; matched=${matchedCount}; modified=${modifiedCount}`
  )
}

/**
 * Removes floating-point excess from `state.totalHectaresForSelectedParcels`
 * and its copy in `state.additionalAnswers.totalHectaresForSelectedParcels`
 * by rounding each to four decimal places on draft applications. Both copies
 * are rounded the same way, so equal values stay equal.
 *
 * Uses MongoDB `$round`, which rounds half to even. Safe to re-run: a failure
 * part-way leaves the migration unrecorded and a re-run completes it.
 *
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const up = async (db) => {
  const collection = db.collection(STATE_COLLECTION)

  for (const path of HECTARES_PATHS) {
    await roundHectaresAtPath(collection, path)
  }
}

/**
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const down = async (db) => {
  // Intentionally not implemented: the unrounded values were floating-point artefacts and are not retained.
}
