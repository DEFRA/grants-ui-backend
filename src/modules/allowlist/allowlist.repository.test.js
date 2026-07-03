import { MongoClient } from 'mongodb'
import { initAllowlistRepository, findGrantCodesByEntry, findGrantCodesWithAllowlist } from './allowlist.repository.js'
import { up as createAllowlistIndexes } from '~/migrations/config/20260703000000-drop-env-from-allowlist-indexes.js'

const COLLECTION = 'config__allowlist_entries'

const makeEntry = (overrides = {}) => ({
  grantCode: 'woodland',
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
          makeEntry({ grantCode: 'woodland', type: 'crn', value: '111' }),
          makeEntry({ grantCode: 'farm-payments', type: 'crn', value: '111' }),
          makeEntry({ grantCode: 'other-grant', type: 'crn', value: '999' })
        ])

      const result = await findGrantCodesByEntry('crn', '111')

      expect(result).toHaveLength(2)
      expect(result).toEqual(expect.arrayContaining(['woodland', 'farm-payments']))
    })

    test('does not match entries of a different type', async () => {
      await db.collection(COLLECTION).insertOne(makeEntry({ type: 'sbi', value: '111' }))

      const result = await findGrantCodesByEntry('crn', '111')

      expect(result).toEqual([])
    })

    test('returns empty array when no entries match', async () => {
      const result = await findGrantCodesByEntry('crn', 'unknown')

      expect(result).toEqual([])
    })
  })

  describe('findGrantCodesWithAllowlist', () => {
    test('returns a Map of grantCode to meta for all grants with entries', async () => {
      await db
        .collection(COLLECTION)
        .insertMany([
          makeEntry({ grantCode: 'woodland', type: 'crn', value: '111' }),
          makeEntry({ grantCode: 'woodland', type: 'sbi', value: '999' }),
          makeEntry({ grantCode: 'farm-payments', type: 'crn', value: '222' })
        ])

      const result = await findGrantCodesWithAllowlist()

      expect(result).toBeInstanceOf(Map)
      expect(result.size).toBe(2)
      expect(result.get('woodland')).toEqual({ allowAll: false })
      expect(result.get('farm-payments')).toEqual({ allowAll: false })
    })

    test('sets allowAll: true for grants with an allowAll entry', async () => {
      await db
        .collection(COLLECTION)
        .insertMany([
          makeEntry({ grantCode: 'woodland', type: 'allowAll', value: 'true' }),
          makeEntry({ grantCode: 'farm-payments', type: 'crn', value: '111' })
        ])

      const result = await findGrantCodesWithAllowlist()

      expect(result.get('woodland')).toEqual({ allowAll: true })
      expect(result.get('farm-payments')).toEqual({ allowAll: false })
    })

    test('returns empty Map when collection is empty', async () => {
      const result = await findGrantCodesWithAllowlist()

      expect(result).toBeInstanceOf(Map)
      expect(result.size).toBe(0)
    })
  })
})
