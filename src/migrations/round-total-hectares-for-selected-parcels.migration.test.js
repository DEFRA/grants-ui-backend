/**
 * Tests for the migration that rounds `state.totalHectaresForSelectedParcels`
 * and its copy in `state.additionalAnswers` to four decimal places on draft
 * applications (those with a missing or null `state.submittedAt`).
 *
 * The total is calculated, so floating-point arithmetic can leave spurious
 * trailing digits (e.g. 1.1 + 2.2 = 3.3000000000000003). Values like
 * 12.345678 stand in for any total carrying more than four decimal places.
 */
import { up } from '~/migrations/state/20261106000000-round-total-hectares-for-selected-parcels.js'
import { setupMigrationTestContext } from '../test-helpers/migration-test-context.js'

const COLLECTION = 'state__grant_application_state'

describe('round-total-hectares-for-selected-parcels migration', () => {
  const context = setupMigrationTestContext({
    dbName: 'round-total-hectares-for-selected-parcels-migration-test',
    collection: COLLECTION
  })

  const insert = (...docs) => context.db.collection(COLLECTION).insertMany(docs)
  const find = (_id) => context.db.collection(COLLECTION).findOne({ _id })

  test('removes floating-point excess from a calculated total', async () => {
    const calculatedTotal = 1.1 + 2.2
    expect(calculatedTotal).toBe(3.3000000000000003)
    await insert({ _id: 'float', state: { totalHectaresForSelectedParcels: calculatedTotal } })

    await up(context.db)

    expect((await find('float')).state.totalHectaresForSelectedParcels).toBe(3.3)
  })

  test('rounds draft applications with more than four decimal places', async () => {
    await insert({ _id: 'draft', state: { totalHectaresForSelectedParcels: 12.345678, other: 'kept' } })

    await up(context.db)

    expect(await find('draft')).toEqual({
      _id: 'draft',
      state: { totalHectaresForSelectedParcels: 12.3457, other: 'kept' }
    })
  })

  test('rounds the copy in state.additionalAnswers to the same value', async () => {
    await insert({
      _id: 'both',
      state: {
        totalHectaresForSelectedParcels: 12.345678,
        additionalAnswers: { totalHectaresForSelectedParcels: 12.345678, other: 'kept' }
      }
    })

    await up(context.db)

    expect(await find('both')).toEqual({
      _id: 'both',
      state: {
        totalHectaresForSelectedParcels: 12.3457,
        additionalAnswers: { totalHectaresForSelectedParcels: 12.3457, other: 'kept' }
      }
    })
  })

  test('rounds the additionalAnswers copy when only it has more than four decimal places', async () => {
    await insert({
      _id: 'additionalOnly',
      state: {
        totalHectaresForSelectedParcels: 12.3457,
        additionalAnswers: { totalHectaresForSelectedParcels: 12.345678 }
      }
    })

    await up(context.db)

    expect((await find('additionalOnly')).state.additionalAnswers.totalHectaresForSelectedParcels).toBe(12.3457)
  })

  test('does not add the field to additionalAnswers when it is absent', async () => {
    await insert({
      _id: 'noAdditionalField',
      state: { totalHectaresForSelectedParcels: 12.345678, additionalAnswers: { other: 'kept' } }
    })

    await up(context.db)

    expect((await find('noAdditionalField')).state).toEqual({
      totalHectaresForSelectedParcels: 12.3457,
      additionalAnswers: { other: 'kept' }
    })
  })

  test('treats applications with a null submittedAt as drafts', async () => {
    await insert({ _id: 'nullSubmittedAt', state: { totalHectaresForSelectedParcels: 12.345678, submittedAt: null } })

    await up(context.db)

    expect((await find('nullSubmittedAt')).state.totalHectaresForSelectedParcels).toBe(12.3457)
  })

  test('leaves draft applications with four or fewer decimal places unchanged', async () => {
    await insert(
      { _id: 'four', state: { totalHectaresForSelectedParcels: 1.2345 } },
      { _id: 'whole', state: { totalHectaresForSelectedParcels: 7 } }
    )

    await up(context.db)

    expect((await find('four')).state.totalHectaresForSelectedParcels).toBe(1.2345)
    expect((await find('whole')).state.totalHectaresForSelectedParcels).toBe(7)
  })

  test('leaves submitted applications unchanged', async () => {
    await insert({
      _id: 'submitted',
      state: {
        totalHectaresForSelectedParcels: 12.345678,
        additionalAnswers: { totalHectaresForSelectedParcels: 12.345678 },
        submittedAt: '2026-03-01T00:00:00.000Z'
      }
    })

    await up(context.db)

    const { state } = await find('submitted')
    expect(state.totalHectaresForSelectedParcels).toBe(12.345678)
    expect(state.additionalAnswers.totalHectaresForSelectedParcels).toBe(12.345678)
  })

  test('leaves applications without the field unchanged', async () => {
    const doc = { _id: 'missing', state: { other: 'value' } }
    await insert(doc)

    await up(context.db)

    expect(await find('missing')).toEqual(doc)
  })

  test('logs counts per path and is idempotent', async () => {
    await insert(
      { _id: 'a', state: { totalHectaresForSelectedParcels: 0.123456 } },
      {
        _id: 'b',
        state: {
          totalHectaresForSelectedParcels: 3.99999,
          additionalAnswers: { totalHectaresForSelectedParcels: 3.99999 }
        }
      }
    )

    await up(context.db)
    expect(context.consoleInfo).toHaveBeenCalledWith(
      'round-total-hectares-for-selected-parcels: path=state.totalHectaresForSelectedParcels; matched=2; modified=2'
    )
    expect(context.consoleInfo).toHaveBeenCalledWith(
      'round-total-hectares-for-selected-parcels: path=state.additionalAnswers.totalHectaresForSelectedParcels; matched=1; modified=1'
    )
    expect((await find('b')).state.totalHectaresForSelectedParcels).toBe(4)

    context.consoleInfo.mockClear()
    await up(context.db)
    expect(context.consoleInfo).toHaveBeenCalledWith(
      'round-total-hectares-for-selected-parcels: path=state.totalHectaresForSelectedParcels; matched=0; modified=0'
    )
    expect(context.consoleInfo).toHaveBeenCalledWith(
      'round-total-hectares-for-selected-parcels: path=state.additionalAnswers.totalHectaresForSelectedParcels; matched=0; modified=0'
    )
  })
})
