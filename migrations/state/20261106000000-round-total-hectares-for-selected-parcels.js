const STATE_COLLECTION = 'state__grant_application_state'
const FIELD = '$state.totalHectaresForSelectedParcels'
const DECIMAL_PLACES = 4

const roundedHectares = { $round: [FIELD, DECIMAL_PLACES] }

// A draft is any application that has not yet been submitted: submittedAt is missing or null.
const isDraftApplication = { $in: [{ $type: '$state.submittedAt' }, ['missing', 'null']] }

const hasMoreThanFourDecimalPlaces = {
  $and: [{ $isNumber: FIELD }, { $ne: [FIELD, roundedHectares] }]
}

/**
 * Rounds `state.totalHectaresForSelectedParcels` to four decimal places on
 * draft applications (missing or null `state.submittedAt`) whose value has more than four.
 * Submitted applications are left as they were submitted.
 *
 * Uses MongoDB `$round`, which rounds half to even.
 *
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const up = async (db) => {
  const { matchedCount, modifiedCount } = await db
    .collection(STATE_COLLECTION)
    .updateMany({ $expr: { $and: [isDraftApplication, hasMoreThanFourDecimalPlaces] } }, [
      { $set: { 'state.totalHectaresForSelectedParcels': roundedHectares } }
    ])

  console.info(`round-total-hectares-for-selected-parcels: matched=${matchedCount}; modified=${modifiedCount}`)
}

/**
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const down = async (db) => {
  // Intentionally not implemented: the original unrounded values are not retained.
}
