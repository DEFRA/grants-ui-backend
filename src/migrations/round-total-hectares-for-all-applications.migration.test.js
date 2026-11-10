/**
 * Tests for the migration that rounds `state.totalHectaresForSelectedParcels`
 * and its copy in `state.additionalAnswers` to four decimal places on every
 * application, whether submitted or not.
 *
 * The total is calculated, so floating-point arithmetic can leave spurious
 * trailing digits (e.g. 1.1 + 2.2 = 3.3000000000000003). Values like
 * 12.345678 stand in for any total carrying more than four decimal places.
 *
 * See create-indexes.migration.test.js for why this spec lives under
 * `src/migrations/` rather than alongside the migration file itself.
 */
import { up } from '~/migrations/state/20261109000000-round-total-hectares-for-all-applications.js'
import { setupMigrationTestContext } from '../test-helpers/migration-test-context.js'

const COLLECTION = 'state__grant_application_state'
const LOG_PREFIX = 'round-total-hectares-for-all-applications'
const SUBMITTED_AT = '2026-03-01T00:00:00.000Z'

const submitted = (_id, state) => ({ _id, state: { ...state, submittedAt: SUBMITTED_AT } })

describe('round-total-hectares-for-all-applications migration', () => {
  const context = setupMigrationTestContext({
    dbName: 'round-total-hectares-for-all-applications-migration-test',
    collection: COLLECTION
  })

  const insert = (...docs) => context.db.collection(COLLECTION).insertMany(docs)
  const find = (_id) => context.db.collection(COLLECTION).findOne({ _id })

  test('removes floating-point excess from a calculated total', async () => {
    const calculatedTotal = 1.1 + 2.2
    await insert(submitted('float', { totalHectaresForSelectedParcels: calculatedTotal }))

    await up(context.db)

    expect((await find('float')).state.totalHectaresForSelectedParcels).toBe(3.3)
  })

  test('rounds both copies to the same value and leaves other fields unchanged', async () => {
    await insert(
      submitted('both', {
        totalHectaresForSelectedParcels: 12.345678,
        additionalAnswers: { totalHectaresForSelectedParcels: 12.345678, other: 'kept' }
      })
    )

    await up(context.db)

    expect(await find('both')).toEqual(
      submitted('both', {
        totalHectaresForSelectedParcels: 12.3457,
        additionalAnswers: { totalHectaresForSelectedParcels: 12.3457, other: 'kept' }
      })
    )
  })

  test('does not create additionalAnswers when it is absent', async () => {
    await insert(submitted('noAdditional', { totalHectaresForSelectedParcels: 12.345678 }))

    await up(context.db)

    expect(await find('noAdditional')).toEqual(submitted('noAdditional', { totalHectaresForSelectedParcels: 12.3457 }))
  })

  test('leaves values with four or fewer decimal places unchanged', async () => {
    await insert(
      submitted('four', { totalHectaresForSelectedParcels: 1.2345 }),
      submitted('whole', { totalHectaresForSelectedParcels: 7 })
    )

    await up(context.db)

    expect((await find('four')).state.totalHectaresForSelectedParcels).toBe(1.2345)
    expect((await find('whole')).state.totalHectaresForSelectedParcels).toBe(7)
  })

  test.each([
    ['missing', {}],
    ['null', { submittedAt: null }]
  ])('also rounds unsubmitted applications (submittedAt %s)', async (_label, submittedAt) => {
    const unsubmitted = (hectares) => ({
      _id: 'unsubmitted',
      state: {
        totalHectaresForSelectedParcels: hectares,
        additionalAnswers: { totalHectaresForSelectedParcels: hectares },
        ...submittedAt
      }
    })
    await insert(unsubmitted(12.345678))

    await up(context.db)

    expect(await find('unsubmitted')).toEqual(unsubmitted(12.3457))
  })

  test('logs submittedAt as null for unsubmitted applications', async () => {
    await insert({ _id: 'b', applicationRef: 'REF-B', state: { totalHectaresForSelectedParcels: 12.345678 } })

    await up(context.db)

    expect(context.consoleInfo).toHaveBeenCalledWith(expect.stringContaining('applicationRef=REF-B;'))
    expect(context.consoleInfo).toHaveBeenCalledWith(expect.stringContaining('submittedAt=null; from=12.345678'))
  })

  test('logs each affected application before rounding, then counts per path', async () => {
    await insert({
      ...submitted('a', {
        totalHectaresForSelectedParcels: 12.345678,
        additionalAnswers: { totalHectaresForSelectedParcels: 12.345678 }
      }),
      applicationRef: 'REF-A',
      sbi: '800000904',
      grantCode: 'farm-payments'
    })

    await up(context.db)

    for (const path of [
      'state.totalHectaresForSelectedParcels',
      'state.additionalAnswers.totalHectaresForSelectedParcels'
    ]) {
      expect(context.consoleInfo).toHaveBeenCalledWith(
        `${LOG_PREFIX}: path=${path}; applicationRef=REF-A; sbi=800000904; grantCode=farm-payments; submittedAt=${SUBMITTED_AT}; from=12.345678; to=12.3457`
      )
      expect(context.consoleInfo).toHaveBeenCalledWith(`${LOG_PREFIX}: path=${path}; matched=1; modified=1`)
    }
  })

  test('is idempotent', async () => {
    await insert(submitted('a', { totalHectaresForSelectedParcels: 0.123456 }))

    await up(context.db)
    context.consoleInfo.mockClear()
    await up(context.db)

    expect(context.consoleInfo).toHaveBeenCalledWith(
      `${LOG_PREFIX}: path=state.totalHectaresForSelectedParcels; matched=0; modified=0`
    )
    expect(context.consoleInfo).toHaveBeenCalledTimes(2)
  })
})
