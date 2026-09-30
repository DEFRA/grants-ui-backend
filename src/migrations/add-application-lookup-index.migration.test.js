/**
 * Tests for the `add-application-lookup-index` migrate-mongo migration.
 *
 * See create-indexes.migration.test.js for why this spec lives under
 * `src/migrations/` rather than alongside the migration file itself.
 */
import { MongoClient } from 'mongodb'
import { up as upMultiApplicationIndexes } from '~/migrations/state/20260924000000-multi-application-indexes.js'
import { up as upLookupIndex } from '~/migrations/state/20260930000000-add-application-lookup-index.js'

const COLLECTION = 'state__grant_application_state'
const LOOKUP_INDEX_NAME = 'sbi_1_grantCode_1_grantVersion_1_applicationRef_1_lookup'

describe('add-application-lookup-index migration', () => {
  let connection
  let db

  beforeAll(async () => {
    connection = await MongoClient.connect(process.env.MONGO_URI)
    db = connection.db('add-application-lookup-index-migration-test')
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

  test('creates the lookup index and is idempotent', async () => {
    await upLookupIndex(db)
    await upLookupIndex(db)

    const index = (await db.collection(COLLECTION).indexes()).find((i) => i.name === LOOKUP_INDEX_NAME)
    expect(index.key).toEqual({ sbi: 1, grantCode: 1, grantVersion: 1, applicationRef: 1 })
    expect(index.unique).toBeUndefined()
    expect(index.partialFilterExpression).toBeUndefined()
  })

  describe('lookup coverage', () => {
    // Reads do not carry allowMultipleApplications, so neither partial unique
    // index can serve them. Without this plain index the queries below
    // collection-scan. Needs enough documents that the planner would not pick
    // a scan regardless.
    beforeEach(async () => {
      await upMultiApplicationIndexes(db)
      await upLookupIndex(db)
      await db.collection(COLLECTION).insertMany(
        Array.from({ length: 200 }, (_, i) => ({
          sbi: `S${i}`,
          grantCode: 'wm',
          grantVersion: '1.0.0',
          allowMultipleApplications: i % 2 === 0,
          applicationRef: `REF-${i}`,
          state: {}
        }))
      )
    })

    test.each([
      ['sbi + grantCode + grantVersion', { sbi: 'S100', grantCode: 'wm', grantVersion: '1.0.0' }],
      ['sbi + grantCode', { sbi: 'S100', grantCode: 'wm' }],
      ['sbi + grantCode + applicationRef', { sbi: 'S101', grantCode: 'wm', applicationRef: 'REF-101' }]
    ])('a %s lookup uses an index rather than scanning the collection', async (_label, filter) => {
      const plan = await db.collection(COLLECTION).find(filter).explain('executionStats')

      expect(JSON.stringify(plan.queryPlanner.winningPlan)).not.toContain('COLLSCAN')
      expect(plan.executionStats.totalDocsExamined).toBeLessThan(10)
    })
  })
})
