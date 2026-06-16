import { MongoClient } from 'mongodb'
import { initAllowlistRepository, findGrantCodesByEntry, findGrantCodesWithAllowlist } from './allowlist.repository.js'
import { up as createAllowlistIndexes } from '~/migrations/config/20260612000000-create-allowlist-indexes.js'

const COLLECTION = 'config__allowlist_entries'

const makeEntry = (overrides = {}) => ({
  grantCode: 'woodland',
  env: 'local',
  type: 'crn',
  value: '1234567890',
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  ...overrides
})

describe('allowlist.repository', () => {
  let connection
  let db

  beforeAll(async () => {
    const uri = new URL(process.env.MONGO_URI)
    uri.searchParams.set('retryWrites', 'false')
    connection = await MongoClient.connect(uri.toString())
    db = connection.db('grants-ui-allowlist-test')
    await createAllowlistIndexes(db)
    initAllowlistRepository(db)
  })

  afterAll(async () => {
    await db
      .collection(COLLECTION)
      .drop()
      .catch(() => {})
    await connection.close()
  })

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({})
  })

  describe('findGrantCodesByEntry', () => {
    test('returns grant codes where the user appears in the given type list', async () => {
      await db
        .collection(COLLECTION)
        .insertMany([
          makeEntry({ grantCode: 'woodland', type: 'crn', value: '111', env: 'local' }),
          makeEntry({ grantCode: 'farm-payments', type: 'crn', value: '111', env: 'local' }),
          makeEntry({ grantCode: 'other-grant', type: 'crn', value: '999', env: 'local' })
        ])

      const result = await findGrantCodesByEntry('crn', '111', 'local')

      expect(result).toHaveLength(2)
      expect(result).toEqual(expect.arrayContaining(['woodland', 'farm-payments']))
    })

    test('does not match entries from a different environment', async () => {
      await db.collection(COLLECTION).insertOne(makeEntry({ type: 'crn', value: '111', env: 'production' }))

      const result = await findGrantCodesByEntry('crn', '111', 'local')

      expect(result).toEqual([])
    })

    test('does not match entries of a different type', async () => {
      await db.collection(COLLECTION).insertOne(makeEntry({ type: 'sbi', value: '111', env: 'local' }))

      const result = await findGrantCodesByEntry('crn', '111', 'local')

      expect(result).toEqual([])
    })

    test('returns empty array when no entries match', async () => {
      const result = await findGrantCodesByEntry('crn', 'unknown', 'local')

      expect(result).toEqual([])
    })
  })

  describe('findGrantCodesWithAllowlist', () => {
    test('returns all grant codes that have any entries for the env', async () => {
      await db
        .collection(COLLECTION)
        .insertMany([
          makeEntry({ grantCode: 'woodland', env: 'local' }),
          makeEntry({ grantCode: 'woodland', env: 'local', type: 'sbi', value: '999' }),
          makeEntry({ grantCode: 'farm-payments', env: 'local' })
        ])

      const result = await findGrantCodesWithAllowlist('local')

      expect(result).toHaveLength(2)
      expect(result).toEqual(expect.arrayContaining(['woodland', 'farm-payments']))
    })

    test('does not return grant codes from a different environment', async () => {
      await db.collection(COLLECTION).insertOne(makeEntry({ grantCode: 'woodland', env: 'production' }))

      const result = await findGrantCodesWithAllowlist('local')

      expect(result).toEqual([])
    })

    test('returns empty array when collection is empty', async () => {
      const result = await findGrantCodesWithAllowlist('local')

      expect(result).toEqual([])
    })
  })
})
