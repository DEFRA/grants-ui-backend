const COLLECTION = 'state__grant_application_state'
const LOG_PREFIX = 'unsubmitted-woodland-applications'

const redactSbi = (sbi) => (sbi == null ? null : `*****${String(sbi).slice(-4)}`)

/**
 * @param newValue {number}
 * @param oldValue {number}
 */
function checkNewAreaAboveTwentyPercent(newValue, oldValue) {
  return newValue > oldValue * 0.2
}

/**
 * Reports unsubmitted woodland applications without changing their stored state.
 *
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const up = async (db) => {
  const query = db.collection(COLLECTION).aggregate([
    {
      $match: {
        grantCode: 'woodland',
        'state.applicationStatus': { $ne: 'SUBMITTED' }
      }
    },
    {
      $project: {
        _id: 0,
        sbi: 1,
        applicationRef: 1,
        applicationStatus: '$state.applicationStatus',
        agreementTotalPence: '$state.payment.agreementTotalPence',
        totalPence: '$state.totalPence',
        hectaresTenOrOverYearsOld: '$state.hectaresTenOrOverYearsOld',
        hectaresUnderTenYearsOld: '$state.hectaresUnderTenYearsOld',
        referenceNumber: {
          $getField: {
            field: { $literal: '$$__referenceNumber' },
            input: '$state'
          }
        }
      }
    }
  ])

  let reported = 0

  for await (const record of query) {
    const report = {
      applicationStatus: record.applicationStatus ?? null,
      calculatedPaymentPence: record.agreementTotalPence ?? record.totalPence ?? null,
      hectaresTenOrOverYearsOld: record.hectaresTenOrOverYearsOld ?? null,
      hectaresUnderTenYearsOld: record.hectaresUnderTenYearsOld ?? null,
      applicationRef: record.applicationRef ?? record.referenceNumber ?? null,
      flaggedForReview: checkNewAreaAboveTwentyPercent(record.hectaresTenOrOverYearsOld, record.hectaresUnderTenYearsOld),
      redactedSbi: redactSbi(record.sbi)
    }

    console.info(`${LOG_PREFIX}: ${JSON.stringify(report)}`)
    reported += 1
  }

  console.info(`${LOG_PREFIX}: reported=${reported}`)
}

/**
 * @param db {import('mongodb').Db}
 * @returns {Promise<void>}
 */
export const down = async (db) => {
  // Nothing to revert
}
