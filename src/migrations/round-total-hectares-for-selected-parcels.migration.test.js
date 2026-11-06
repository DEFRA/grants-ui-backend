/**
 * Tests for the migration that rounds `state.totalHectaresForSelectedParcels`
 * to four decimal places on draft applications (those with no
 * `state.submittedAt`).
 *
 * See create-indexes.migration.test.js for why this spec lives under
 * `src/migrations/` rather than alongside the migration file itself.
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

  test('rounds draft applications with more than four decimal places', async () => {
    await insert({ _id: 'draft', state: { totalHectaresForSelectedParcels: 12.345678, other: 'kept' } })

    await up(context.db)

    expect(await find('draft')).toEqual({
      _id: 'draft',
      state: { totalHectaresForSelectedParcels: 12.3457, other: 'kept' }
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
      state: { totalHectaresForSelectedParcels: 12.345678, submittedAt: '2026-03-01T00:00:00.000Z' }
    })

    await up(context.db)

    expect((await find('submitted')).state.totalHectaresForSelectedParcels).toBe(12.345678)
  })

  test('leaves applications without the field unchanged', async () => {
    const doc = { _id: 'missing', state: { other: 'value' } }
    await insert(doc)

    await up(context.db)

    expect(await find('missing')).toEqual(doc)
  })

  test('logs matched and modified counts and is idempotent', async () => {
    await insert(
      { _id: 'a', state: { totalHectaresForSelectedParcels: 0.123456 } },
      { _id: 'b', state: { totalHectaresForSelectedParcels: 3.99999 } }
    )

    await up(context.db)
    expect(context.consoleInfo).toHaveBeenCalledWith('round-total-hectares-for-selected-parcels: matched=2; modified=2')
    expect((await find('b')).state.totalHectaresForSelectedParcels).toBe(4)

    await up(context.db)
    expect(context.consoleInfo).toHaveBeenLastCalledWith(
      'round-total-hectares-for-selected-parcels: matched=0; modified=0'
    )
  })
})
