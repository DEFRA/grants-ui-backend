import {
  COLLECTION,
  emptyArrayWhenMissingOrNotArray,
  needsNormalising,
  parcelItemValues,
  agreementLevelItemValues,
  stringifyRecordId
} from '../lib/pence-fields.js'

/**
 * Emits a single-element `[{ field, value }]` array when the value needs
 * normalising, otherwise an empty array. Used to accumulate problem lists.
 *
 * @param field {string} the reported field label recorded in the problem entry
 * @param value {string|object} aggregation expression (usually a `$field` ref) to test
 * @returns {object} an aggregation expression producing the problem array
 */
const scalarProblem = (field, value) => ({
  $cond: [needsNormalising(value), [{ field, value }], []]
})

/**
 * For every item in `items`, emit a problem entry per offending field.
 *
 * @param items {object} aggregation expression evaluating to the array of items to inspect
 * @param fields {string[]} field names on each item to test for normalisation
 * @param label {string} dotted path prefix used to build each problem's field label
 * @returns {object} an aggregation expression producing the concatenated problem array
 */
const itemFieldProblems = (items, fields, label) => ({
  $reduce: {
    input: items,
    initialValue: [],
    in: {
      $concatArrays: ['$$value', ...fields.map((field) => scalarProblem(`${label}.${field}`, `$$this.${field}`))]
    }
  }
})

const paymentProblems = {
  $reduce: {
    input: emptyArrayWhenMissingOrNotArray('$state.payment.payments'),
    initialValue: [],
    in: {
      $concatArrays: [
        '$$value',
        scalarProblem('payment.payments.totalPaymentPence', '$$this.totalPaymentPence'),
        {
          $reduce: {
            input: emptyArrayWhenMissingOrNotArray('$$this.lineItems'),
            initialValue: [],
            in: {
              $concatArrays: [
                '$$value',
                scalarProblem('payment.payments.lineItems.paymentPence', '$$this.paymentPence')
              ]
            }
          }
        }
      ]
    }
  }
}

// Builds the full array of offending { field, value } entries for a record.
const problems = {
  $concatArrays: [
    scalarProblem('totalPence', '$state.totalPence'),
    scalarProblem('payment.agreementTotalPence', '$state.payment.agreementTotalPence'),
    scalarProblem('payment.annualTotalPence', '$state.payment.annualTotalPence'),
    itemFieldProblems(parcelItemValues, ['rateInPence', 'annualPaymentPence'], 'payment.parcelItems'),
    itemFieldProblems(
      agreementLevelItemValues,
      ['annualPaymentPence', 'activeTierRatePence', 'activeTierFlatRatePence', 'agreementTotalPence'],
      'payment.agreementLevelItems'
    ),
    paymentProblems
  ]
}

const filter = {
  $expr: { $gt: [{ $size: problems }, 0] }
}

/**
 * Logs the dry-run summary line followed by one line per affected record
 * detailing the offending `{ field, value }` entries.
 *
 * @param affectedRecords {Array<{ _id: unknown, problems: Array<{ field: string, value: number }> }>}
 * @returns {void}
 */
const logReport = (affectedRecords) => {
  const totalProblems = affectedRecords.reduce((sum, { problems: p }) => sum + p.length, 0)

  console.info(
    `report-pence-values (dry run): affectedRecords=${affectedRecords.length}; totalProblemFields=${totalProblems}`
  )

  for (const { _id, problems: recordProblems } of affectedRecords) {
    console.info(
      `report-pence-values (dry run): id=${stringifyRecordId(_id)}; problems=${JSON.stringify(recordProblems)}`
    )
  }
}

/**
 * Read-only companion to the normalise-pence-values migration. Finds records
 * with non-integer pence fields and logs exactly which fields (and values)
 * would be normalised.
 *
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const up = async (db) => {
  const collection = db.collection(COLLECTION)
  const affectedRecords = await collection
    .aggregate([{ $match: filter }, { $project: { _id: 1, problems } }, { $sort: { _id: 1 } }])
    .toArray()

  logReport(affectedRecords)
}

/**
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const down = async (db) => {
  // Intentionally not implemented: this migration only reads and logs.
}
