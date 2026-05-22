import { MongoClient } from 'mongodb'
import {
  createStateIndexes,
  initStateRepository,
  saveApplicationState,
  getApplicationState,
  deleteApplicationState,
  patchApplicationState,
  insertSubmission,
  findSubmissions
} from './state.repository.js'

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

describe('state.repository CRUD error paths', () => {
  const params = { sbi: '123456789', grantCode: 'EGWA', grantVersion: '1.0.0' }
  const dbError = Object.assign(new Error('DB failed'), { name: 'MongoServerError', code: 999 })

  afterEach(() => {
    initStateRepository(null)
  })

  test('saveApplicationState re-throws and logs on error', async () => {
    initStateRepository({
      collection: () => ({
        updateOne: () => {
          throw dbError
        }
      })
    })
    await expect(saveApplicationState({ ...params, state: {} })).rejects.toThrow('DB failed')
  })

  test('getApplicationState re-throws and logs on error', async () => {
    initStateRepository({
      collection: () => ({
        findOne: () => {
          throw dbError
        }
      })
    })
    await expect(getApplicationState(params)).rejects.toThrow('DB failed')
  })

  test('deleteApplicationState re-throws and logs on error', async () => {
    initStateRepository({
      collection: () => ({
        findOneAndDelete: () => {
          throw dbError
        }
      })
    })
    await expect(deleteApplicationState(params)).rejects.toThrow('DB failed')
  })

  test('patchApplicationState re-throws and logs on error', async () => {
    initStateRepository({
      collection: () => ({
        findOneAndUpdate: () => {
          throw dbError
        }
      })
    })
    await expect(patchApplicationState({ ...params, applicationStatus: 'submitted' })).rejects.toThrow('DB failed')
  })

  test('insertSubmission re-throws and logs on error', async () => {
    initStateRepository({
      collection: () => ({
        insertOne: () => {
          throw dbError
        }
      })
    })
    await expect(
      insertSubmission({
        sbi: '123',
        grantCode: 'EGWA',
        grantVersion: '1.0.0',
        referenceNumber: 'R1',
        submittedAt: new Date()
      })
    ).rejects.toThrow('DB failed')
  })

  test('findSubmissions re-throws and logs on error', async () => {
    initStateRepository({
      collection: () => ({
        find: () => {
          throw dbError
        }
      })
    })
    await expect(findSubmissions({ sbi: '123' })).rejects.toThrow('DB failed')
  })
})
