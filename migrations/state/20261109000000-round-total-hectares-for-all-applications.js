/**
 * `totalHectaresForSelectedParcels` is calculated from the selected parcels.
 * Floating-point arithmetic means the result can carry spurious trailing digits
 * (for example 1.1 + 2.2 = 3.3000000000000003), so stored totals are
 * sometimes not the four-decimal-place hectare value they should be.
 *
 * `20261106000000-round-total-hectares-for-selected-parcels.js` rounded draft
 * applications only. This migration rounds every application:
 * - Submitted: GAS corrects its own copy, but an application returned to the
 *   customer can be resubmitted without passing through parcel selection
 *   again, which would resend the unrounded total.
 * - Unsubmitted: an application returned to the customer between the two
 *   migrations would have been submitted when the first one ran, and so missed.
 *
 * As submitted data is being changed and `down` cannot restore it, every
 * affected application is logged with its old and new value before rounding.
 */

const STATE_COLLECTION = 'state__grant_application_state'
const LOG_PREFIX = 'round-total-hectares-for-all-applications'

// Hectare values are held to four decimal places.
const DECIMAL_PLACES = 4

// The calculated total is stored in both places, so both copies need rounding.
const HECTARES_PATHS = [
  'state.totalHectaresForSelectedParcels',
  'state.additionalAnswers.totalHectaresForSelectedParcels'
]

const roundedHectares = (field) => ({ $round: [field, DECIMAL_PLACES] })

// Matches documents where the value is a number carrying more decimal places than hectares are held to.
const needsRounding = (field) => ({
  $expr: { $and: [{ $isNumber: field }, { $ne: [field, roundedHectares(field)] }] }
})

/**
 * Logs one line per affected application at the path, giving an audit trail
 * of the values being changed.
 *
 * @param collection {import('mongodb').Collection}
 * @param path {string} dotted path to the hectares value
 * @returns {Promise<void>}
 */
const logAffectedApplications = async (collection, path) => {
  const field = `$${path}`
  const affected = await collection
    .aggregate([
      { $match: needsRounding(field) },
      {
        $project: {
          applicationRef: 1,
          sbi: 1,
          grantCode: 1,
          submittedAt: '$state.submittedAt',
          from: field,
          to: roundedHectares(field)
        }
      },
      { $sort: { _id: 1 } }
    ])
    .toArray()

  for (const { applicationRef, sbi, grantCode, submittedAt = null, from, to } of affected) {
    console.info(
      `${LOG_PREFIX}: path=${path}; applicationRef=${applicationRef}; sbi=${sbi}; grantCode=${grantCode}; submittedAt=${submittedAt}; from=${from}; to=${to}`
    )
  }
}

/**
 * Rounds the value at one path where it needs rounding. Filtering per path
 * means a document is only updated where the value exists, so a dotted `$set`
 * never creates an empty `additionalAnswers` object.
 *
 * @param collection {import('mongodb').Collection}
 * @param path {string} dotted path to the hectares value
 * @returns {Promise<void>}
 */
const roundHectaresAtPath = async (collection, path) => {
  const field = `$${path}`
  const { matchedCount, modifiedCount } = await collection.updateMany(needsRounding(field), [
    { $set: { [path]: roundedHectares(field) } }
  ])

  console.info(`${LOG_PREFIX}: path=${path}; matched=${matchedCount}; modified=${modifiedCount}`)
}

/**
 * Removes floating-point excess from `state.totalHectaresForSelectedParcels`
 * and its copy in `state.additionalAnswers.totalHectaresForSelectedParcels`
 * by rounding each to four decimal places on every application. Both copies
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
    await logAffectedApplications(collection, path)
    await roundHectaresAtPath(collection, path)
  }
}

/**
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const down = async (db) => {
  // Intentionally not implemented: the unrounded values were floating-point artefacts.
  // The values before rounding are recorded in the migration's log output.
}
