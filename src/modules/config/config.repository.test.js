import { MongoClient } from 'mongodb'
import { createServer } from '../../server.js'
import {
  createConfigIndexes,
  resolveLatestVersion,
  resolveLatestVersionWithinMajor,
  getDefinition
} from './config.repository.js'

const COLLECTION = 'form-definitions'

const makeDefinition = (overrides = {}) => ({
  grantCode: 'farm-payments',
  id: 'fd-001',
  title: 'Farm Payments Application',
  major: 1,
  minor: 0,
  patch: 0,
  definition: { pages: [] },
  status: 'live',
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  ...overrides
})

describe('config.repository', () => {
  let connection
  let db

  beforeAll(async () => {
    connection = await MongoClient.connect(process.env.MONGO_URI)
    db = connection.db('grants-ui-config-test')
    await createConfigIndexes(db)
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

  describe('createConfigIndexes', () => {
    test('creates compound index for resolveLatestVersion queries', async () => {
      const indexes = await db.collection(COLLECTION).indexes()
      const idx = indexes.find(
        (i) =>
          i.key.grantCode === 1 && i.key.status === 1 && i.key.major === -1 && i.key.minor === -1 && i.key.patch === -1
      )
      expect(idx).toBeDefined()
    })

    test('creates exact-match index for getDefinition queries', async () => {
      const indexes = await db.collection(COLLECTION).indexes()
      const idx = indexes.find(
        (i) => i.key.grantCode === 1 && i.key.major === 1 && i.key.minor === 1 && i.key.patch === 1
      )
      expect(idx).toBeDefined()
    })
  })

  describe('resolveLatestVersion', () => {
    test('returns the highest semver live document for a grantCode', async () => {
      await db
        .collection(COLLECTION)
        .insertMany([
          makeDefinition({ major: 1, minor: 0, patch: 0 }),
          makeDefinition({ major: 2, minor: 3, patch: 1 }),
          makeDefinition({ major: 2, minor: 1, patch: 0 })
        ])

      const result = await resolveLatestVersion(db, 'farm-payments')

      expect(result).toMatchObject({ major: 2, minor: 3, patch: 1 })
    })

    test('ignores draft documents', async () => {
      await db
        .collection(COLLECTION)
        .insertMany([
          makeDefinition({ major: 1, minor: 0, patch: 0, status: 'live' }),
          makeDefinition({ major: 2, minor: 0, patch: 0, status: 'draft' })
        ])

      const result = await resolveLatestVersion(db, 'farm-payments')

      expect(result).toMatchObject({ major: 1, minor: 0, patch: 0 })
    })

    test('returns null when no live documents exist', async () => {
      await db.collection(COLLECTION).insertOne(makeDefinition({ status: 'draft' }))

      const result = await resolveLatestVersion(db, 'farm-payments')

      expect(result).toBeNull()
    })

    test('returns null when grantCode does not exist', async () => {
      const result = await resolveLatestVersion(db, 'unknown-grant')

      expect(result).toBeNull()
    })

    test('does not return documents for a different grantCode', async () => {
      await db.collection(COLLECTION).insertOne(makeDefinition({ grantCode: 'other-grant' }))

      const result = await resolveLatestVersion(db, 'farm-payments')

      expect(result).toBeNull()
    })
  })

  describe('resolveLatestVersionWithinMajor', () => {
    test('returns the highest minor/patch within the pinned major', async () => {
      await db
        .collection(COLLECTION)
        .insertMany([
          makeDefinition({ major: 1, minor: 0, patch: 0 }),
          makeDefinition({ major: 1, minor: 2, patch: 5 }),
          makeDefinition({ major: 1, minor: 2, patch: 3 }),
          makeDefinition({ major: 2, minor: 0, patch: 0 })
        ])

      const result = await resolveLatestVersionWithinMajor(db, 'farm-payments', 1)

      expect(result).toMatchObject({ major: 1, minor: 2, patch: 5 })
    })

    test('ignores draft documents within the pinned major', async () => {
      await db
        .collection(COLLECTION)
        .insertMany([
          makeDefinition({ major: 1, minor: 1, patch: 0, status: 'live' }),
          makeDefinition({ major: 1, minor: 2, patch: 0, status: 'draft' })
        ])

      const result = await resolveLatestVersionWithinMajor(db, 'farm-payments', 1)

      expect(result).toMatchObject({ minor: 1, patch: 0 })
    })

    test('returns null when no live documents exist for the pinned major', async () => {
      await db.collection(COLLECTION).insertOne(makeDefinition({ major: 2, minor: 0, patch: 0 }))

      const result = await resolveLatestVersionWithinMajor(db, 'farm-payments', 1)

      expect(result).toBeNull()
    })
  })

  describe('getDefinition', () => {
    test('returns the document matching the exact semver', async () => {
      await db
        .collection(COLLECTION)
        .insertMany([
          makeDefinition({ major: 1, minor: 0, patch: 0 }),
          makeDefinition({ major: 1, minor: 2, patch: 3 })
        ])

      const result = await getDefinition(db, 'farm-payments', 1, 2, 3)

      expect(result).toMatchObject({ major: 1, minor: 2, patch: 3 })
    })

    test('returns null when the exact version does not exist', async () => {
      await db.collection(COLLECTION).insertOne(makeDefinition({ major: 1, minor: 0, patch: 0 }))

      const result = await getDefinition(db, 'farm-payments', 9, 9, 9)

      expect(result).toBeNull()
    })

    test('returns null when grantCode does not match', async () => {
      await db
        .collection(COLLECTION)
        .insertOne(makeDefinition({ grantCode: 'other-grant', major: 1, minor: 0, patch: 0 }))

      const result = await getDefinition(db, 'farm-payments', 1, 0, 0)

      expect(result).toBeNull()
    })

    test('returns draft documents (no status filter)', async () => {
      await db.collection(COLLECTION).insertOne(makeDefinition({ major: 1, minor: 0, patch: 0, status: 'draft' }))

      const result = await getDefinition(db, 'farm-payments', 1, 0, 0)

      expect(result).toMatchObject({ status: 'draft' })
    })
  })
})

describe('config server integration', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
    await server.configMongoIndexesReady
  }, 30_000)

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('configDb does not contain state collections', async () => {
    const collections = await server.configDb.listCollections({ name: 'grant-application-state' }).toArray()
    expect(collections).toHaveLength(0)
  })
})
