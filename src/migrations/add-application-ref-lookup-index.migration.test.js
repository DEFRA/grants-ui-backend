/**
 * Tests for the `add-application-ref-lookup-index` migrate-mongo migration.
 *
 * See create-indexes.migration.test.js for why this spec lives under
 * `src/migrations/` rather than alongside the migration file itself.
 */
import { MongoClient } from 'mongodb'
import { up as upMultiApplicationIndexes } from '~/migrations/state/20260924000000-multi-application-indexes.js'
import { up as upLookupIndex } from '~/migrations/state/20260930000000-add-application-lookup-index.js'
import { up as upRefLookupIndex } from '~/migrations/state/20261001000000-add-application-ref-lookup-index.js'

const COLLECTION = 'state__grant_application_state'
const REF_LOOKUP_INDEX_NAME = 'sbi_1_grantCode_1_applicationRef_1_ref_lookup'

describe('add-application-ref-lookup-index migration', () => {
  let connection
  let db

  beforeAll(async () => {
    connection = await MongoClient.connect(process.env.MONGO_URI)
    db = connection.db('add-application-ref-lookup-index-migration-test')
  })

  afterEach(async () => {
    await db
      .collection(COLLECTION)
      .drop()
      .catch(() => {})
  })

  afterAll(async () => {
    await connection.close()
  })

  test('creates the index and is idempotent', async () => {
    await upRefLookupIndex(db)
    await upRefLookupIndex(db)

    const index = (await db.collection(COLLECTION).indexes()).find((i) => i.name === REF_LOOKUP_INDEX_NAME)
    expect(index.key).toEqual({ sbi: 1, grantCode: 1, applicationRef: 1 })
    expect(index.unique).toBeUndefined()
    expect(index.partialFilterExpression).toBeUndefined()
  })

  test('a lookup by reference without a version is a point lookup', async () => {
    await upMultiApplicationIndexes(db)
    await upLookupIndex(db)
    await upRefLookupIndex(db)

    // One SBI holding many applications: without this index the reference is
    // filtered across all of them rather than sought directly.
    await db.collection(COLLECTION).insertMany(
      Array.from({ length: 50 }, (_, i) => ({
        sbi: 'HEAVY',
        grantCode: 'wm',
        grantVersion: `1.${i % 5}.0`,
        allowMultipleApplications: true,
        applicationRef: `H-${i}`,
        state: {}
      }))
    )

    const plan = await db
      .collection(COLLECTION)
      .find({ sbi: 'HEAVY', grantCode: 'wm', applicationRef: 'H-49' })
      .explain('executionStats')

    expect(plan.executionStats.totalKeysExamined).toBe(1)
    expect(plan.executionStats.nReturned).toBe(1)
  })
})
