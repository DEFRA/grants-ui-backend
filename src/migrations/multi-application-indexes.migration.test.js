/**
 * Tests for the `multi-application-indexes` migrate-mongo migration.
 *
 * See create-indexes.migration.test.js for why this spec lives under
 * `src/migrations/` rather than alongside the migration file itself.
 */
import { MongoClient } from 'mongodb'
import { up as upMultiApplicationIndexes } from '~/migrations/state/20260924000000-multi-application-indexes.js'

const COLLECTION = 'state__grant_application_state'
const SINGLE_APP_INDEX_NAME = 'sbi_1_grantCode_1_grantVersion_1_single_app'
const MULTI_APP_INDEX_NAME = 'sbi_1_grantCode_1_applicationRef_1_multi_app'

describe('multi-application-indexes migration', () => {
  let connection
  let db

  beforeAll(async () => {
    connection = await MongoClient.connect(process.env.MONGO_URI)
    db = connection.db('multi-application-indexes-migration-test')
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

  test('creates both partial unique indexes, drops the legacy one, and is idempotent', async () => {
    await db.collection(COLLECTION).createIndex({ sbi: 1, grantCode: 1, grantVersion: 1 }, { unique: true })

    await upMultiApplicationIndexes(db)
    await upMultiApplicationIndexes(db)

    const indexes = await db.collection(COLLECTION).indexes()

    const singleAppIndex = indexes.find((i) => i.name === SINGLE_APP_INDEX_NAME)
    expect(singleAppIndex.unique).toBe(true)
    expect(singleAppIndex.key).toEqual({ sbi: 1, grantCode: 1, grantVersion: 1 })
    expect(singleAppIndex.partialFilterExpression).toEqual({ allowMultipleApplications: false })

    const multiAppIndex = indexes.find((i) => i.name === MULTI_APP_INDEX_NAME)
    expect(multiAppIndex.unique).toBe(true)
    expect(multiAppIndex.key).toEqual({ sbi: 1, grantCode: 1, applicationRef: 1 })
    expect(multiAppIndex.partialFilterExpression).toEqual({ allowMultipleApplications: true })

    expect(indexes.find((i) => i.name === 'sbi_1_grantCode_1_grantVersion_1')).toBeUndefined()
  })

  test('backfills allowMultipleApplications: false onto pre-existing documents', async () => {
    await db.collection(COLLECTION).insertMany([
      { sbi: '1', grantCode: 'g1', grantVersion: '1.0.0', state: {} },
      {
        sbi: '2',
        grantCode: 'g1',
        grantVersion: '1.0.0',
        state: {},
        allowMultipleApplications: true,
        applicationRef: 'ref-1'
      }
    ])

    await upMultiApplicationIndexes(db)

    const docs = await db.collection(COLLECTION).find().sort({ sbi: 1 }).toArray()
    expect(docs[0].allowMultipleApplications).toBe(false)
    expect(docs[1].allowMultipleApplications).toBe(true)
  })

  test('promotes applicationRef from the state payload onto pre-existing documents', async () => {
    await db.collection(COLLECTION).insertMany([
      { sbi: '1', grantCode: 'g1', grantVersion: '1.0.0', state: { $$__referenceNumber: 'WMG-001' } },
      { sbi: '2', grantCode: 'g1', grantVersion: '1.0.0', state: { noRef: true } },
      {
        sbi: '3',
        grantCode: 'g1',
        grantVersion: '1.0.0',
        applicationRef: 'ALREADY-SET',
        state: { $$__referenceNumber: 'WMG-003' }
      }
    ])

    await upMultiApplicationIndexes(db)

    const docs = await db.collection(COLLECTION).find().sort({ sbi: 1 }).toArray()
    expect(docs[0].applicationRef).toBe('WMG-001')
    // No ref to promote: the field stays absent rather than becoming null,
    // which would otherwise land the document in the multi-application index.
    expect('applicationRef' in docs[1]).toBe(false)
    expect(docs[2].applicationRef).toBe('ALREADY-SET')
  })

  describe('single-application constraint', () => {
    test('rejects a second document for the same (sbi, grantCode, grantVersion)', async () => {
      await upMultiApplicationIndexes(db)

      await db.collection(COLLECTION).insertOne({
        sbi: '999',
        grantCode: 'g1',
        grantVersion: '1.0.0',
        allowMultipleApplications: false,
        applicationRef: 'ref-a',
        state: {}
      })

      await expect(
        db.collection(COLLECTION).insertOne({
          sbi: '999',
          grantCode: 'g1',
          grantVersion: '1.0.0',
          allowMultipleApplications: false,
          applicationRef: 'ref-b',
          state: {}
        })
      ).rejects.toThrow(/E11000/)
    })
  })

  describe('multi-application constraint', () => {
    test('allows several applications for one (sbi, grantCode) with distinct applicationRefs', async () => {
      await upMultiApplicationIndexes(db)

      await db.collection(COLLECTION).insertOne({
        sbi: '999',
        grantCode: 'g2',
        grantVersion: '1.0.0',
        allowMultipleApplications: true,
        applicationRef: 'ref-a',
        state: {}
      })

      await expect(
        db.collection(COLLECTION).insertOne({
          sbi: '999',
          grantCode: 'g2',
          grantVersion: '1.0.0',
          allowMultipleApplications: true,
          applicationRef: 'ref-b',
          state: {}
        })
      ).resolves.toBeDefined()

      expect(await db.collection(COLLECTION).countDocuments({ sbi: '999', grantCode: 'g2' })).toBe(2)
    })

    test('rejects a duplicate applicationRef', async () => {
      await upMultiApplicationIndexes(db)

      await db.collection(COLLECTION).insertOne({
        sbi: '999',
        grantCode: 'g3',
        grantVersion: '1.0.0',
        allowMultipleApplications: true,
        applicationRef: 'ref-a',
        state: {}
      })

      await expect(
        db.collection(COLLECTION).insertOne({
          sbi: '999',
          grantCode: 'g3',
          grantVersion: '1.0.0',
          allowMultipleApplications: true,
          applicationRef: 'ref-a',
          state: {}
        })
      ).rejects.toThrow(/E11000/)
    })

    test('rejects the same applicationRef at a different grantVersion, so a version bump cannot split an application', async () => {
      await upMultiApplicationIndexes(db)

      await db.collection(COLLECTION).insertOne({
        sbi: '999',
        grantCode: 'g4',
        grantVersion: '1.0.0',
        allowMultipleApplications: true,
        applicationRef: 'ref-a',
        state: {}
      })

      await expect(
        db.collection(COLLECTION).insertOne({
          sbi: '999',
          grantCode: 'g4',
          grantVersion: '1.1.0',
          allowMultipleApplications: true,
          applicationRef: 'ref-a',
          state: {}
        })
      ).rejects.toThrow(/E11000/)
    })
  })
})
