export const COLLECTION = 'state__grant_application_state'

/**
 * Yields the value when it is an array, otherwise an empty array — used to make
 * downstream `$map`/`$reduce` stages safe against missing or malformed fields.
 *
 * @param value {string|object} aggregation expression (usually a `$field` ref) to guard
 * @returns {object} an aggregation expression producing an array
 */
export const emptyArrayWhenMissingOrNotArray = (value) => ({
  $cond: [{ $isArray: value }, value, []]
})

/**
 * Yields the values of a strict object as an array (via `$objectToArray`),
 * otherwise an empty array. Lets object-keyed maps be iterated like arrays.
 *
 * @param value {string|object} aggregation expression (usually a `$field` ref) to inspect
 * @returns {object} an aggregation expression producing an array of the object's values
 */
export const objectValuesWhenStrictObject = (value) => ({
  $cond: [
    { $eq: [{ $type: value }, 'object'] },
    {
      $map: {
        input: { $objectToArray: value },
        as: 'entry',
        in: '$$entry.v'
      }
    },
    []
  ]
})

/**
 * True when the value is a number that is not already a whole pence integer —
 * i.e. an upstream floating-point pence value that needs rounding.
 *
 * @param value {string|object} aggregation expression (usually a `$field` ref) to test
 * @returns {object} a boolean aggregation expression
 */
export const needsNormalising = (value) => ({
  $and: [{ $isNumber: value }, { $ne: [value, { $round: [value, 0] }] }]
})

export const parcelItemValues = {
  $concatArrays: [
    emptyArrayWhenMissingOrNotArray('$state.payment.parcelItems'),
    objectValuesWhenStrictObject('$state.payment.parcelItems')
  ]
}

export const agreementLevelItemValues = {
  $concatArrays: [
    emptyArrayWhenMissingOrNotArray('$state.payment.agreementLevelItems'),
    objectValuesWhenStrictObject('$state.payment.agreementLevelItems')
  ]
}

/**
 * Renders a record `_id` as a stable string, using `toHexString()` for
 * `ObjectId`s and falling back to `String()` for plain (e.g. slug) ids.
 *
 * @param id {unknown} the record identifier to stringify
 * @returns {string} the id as a string
 */
export const stringifyRecordId = (id) => {
  if (id && typeof id.toHexString === 'function') {
    return id.toHexString()
  }

  return String(id)
}
