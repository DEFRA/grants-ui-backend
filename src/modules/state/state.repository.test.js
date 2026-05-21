import { MongoClient } from 'mongodb'
import { createStateIndexes } from './state.repository.js'

describe('state.repository', () => {
  let connection
  let db

  beforeAll(async () => {
    connection = await MongoClient.connect(process.env.MONGO_URI)
    db = connection.db('grants-ui-state-test')
    await createStateIndexes(db)
  })

  afterAll(async () => {
    await connection.close()
  })

  describe('createStateIndexes', () => {
    test('creates a TTL index on application locks', async () => {
      const indexes = await db.collection('grant-application-locks').indexes()
      const ttlIndex = indexes.find((i) => i.key.expiresAt === 1)

      expect(ttlIndex).toBeDefined()
      expect(ttlIndex.expireAfterSeconds).toBe(0)
    })

    test('creates unique index on application locks', async () => {
      const indexes = await db.collection('grant-application-locks').indexes()
      const uniqueIndex = indexes.find(
        (i) => i.unique && i.key.grantCode === 1 && i.key.grantVersion === 1 && i.key.sbi === 1
      )

      expect(uniqueIndex).toBeDefined()
    })

    test('creates unique index on application state', async () => {
      const indexes = await db.collection('grant-application-state').indexes()
      const uniqueIndex = indexes.find(
        (i) => i.unique && i.key.sbi === 1 && i.key.grantCode === 1 && i.key.grantVersion === 1
      )

      expect(uniqueIndex).toBeDefined()
    })

    test('creates unique index on application submissions', async () => {
      const indexes = await db.collection('grant_application_submissions').indexes()
      const uniqueIndex = indexes.find(
        (i) =>
          i.unique &&
          i.key.sbi === 1 &&
          i.key.grantCode === 1 &&
          i.key.grantVersion === 1 &&
          i.key.referenceNumber === 1
      )

      expect(uniqueIndex).toBeDefined()
    })
  })
})
