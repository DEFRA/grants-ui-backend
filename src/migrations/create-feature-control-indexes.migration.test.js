/**
 * Test for the `create-feature-control-indexes` config migration. Lives under
 * `src/migrations/` so Jest discovers it (see create-indexes.migration.test.js).
 */
import { MongoClient } from 'mongodb'
import { up, down } from '~/migrations/config/20260924000000-create-feature-control-indexes.js'

const COLLECTION = 'config__feature_controls'

describe('create-feature-control-indexes migration', () => {
  let connection
  let db

  beforeAll(async () => {
    connection = await MongoClient.connect(process.env.MONGO_URI)
    db = connection.db('feature-control-indexes-migration-test')
  })

  afterAll(async () => {
    await db
      .collection(COLLECTION)
      .drop()
      .catch(() => {})
    await connection.close()
  })

  test('creates a unique name index and is idempotent', async () => {
    await up(db)
    await up(db)

    const indexes = await db.collection(COLLECTION).indexes()
    expect(indexes.find((i) => i.unique && i.key.name === 1)).toBeDefined()
  })

  test('down removes the name index', async () => {
    await up(db)
    await down(db)

    const indexes = await db.collection(COLLECTION).indexes()
    expect(indexes.find((i) => i.key.name === 1)).toBeUndefined()
  })
})
