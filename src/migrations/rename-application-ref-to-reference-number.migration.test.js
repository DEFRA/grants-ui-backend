/**
 * Tests for the `rename-application-ref-to-reference-number` migrate-mongo
 * migration.
 *
 * See create-indexes.migration.test.js for why this spec lives under
 * `src/migrations/` rather than alongside the migration file itself.
 */
import { MongoClient } from 'mongodb'
import { up as upMultiApplicationIndexes } from '~/migrations/state/20260924000000-multi-application-indexes.js'
import { up as upLookupIndex } from '~/migrations/state/20260930000000-add-application-lookup-index.js'
import { up as upRefLookupIndex } from '~/migrations/state/20261001000000-add-application-ref-lookup-index.js'
import { up, down } from '~/migrations/state/20261002000000-rename-application-ref-to-reference-number.js'

const COLLECTION = 'state__grant_application_state'
const MULTI_APP_INDEX_NAME = 'sbi_1_grantCode_1_referenceNumber_1_multi_app'
const LOOKUP_INDEX_NAME = 'sbi_1_grantCode_1_grantVersion_1_referenceNumber_1_lookup'
const REF_LOOKUP_INDEX_NAME = 'sbi_1_grantCode_1_referenceNumber_1_ref_lookup'
const LEGACY_MULTI_APP_INDEX_NAME = 'sbi_1_grantCode_1_applicationRef_1_multi_app'
const LEGACY_LOOKUP_INDEX_NAME = 'sbi_1_grantCode_1_grantVersion_1_applicationRef_1_lookup'
const LEGACY_REF_LOOKUP_INDEX_NAME = 'sbi_1_grantCode_1_applicationRef_1_ref_lookup'

describe('rename-application-ref-to-reference-number migration', () => {
  let connection
  let db

  beforeAll(async () => {
    connection = await MongoClient.connect(process.env.MONGO_URI)
    db = connection.db('rename-application-ref-to-reference-number-migration-test')
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

  const seedLegacyDocument = async (overrides = {}) =>
    db.collection(COLLECTION).insertOne({
      sbi: 'SBI1',
      grantCode: 'wm',
      grantVersion: '1.0.0',
      allowMultipleApplications: true,
      applicationRef: 'REF-1',
      state: {},
      ...overrides
    })

  test('renames the field on existing documents', async () => {
    await seedLegacyDocument()

    await up(db)

    const doc = await db.collection(COLLECTION).findOne({ sbi: 'SBI1', grantCode: 'wm' })
    expect(doc.referenceNumber).toBe('REF-1')
    expect(doc.applicationRef).toBeUndefined()
  })

  test('leaves documents with no applicationRef untouched', async () => {
    await db.collection(COLLECTION).insertOne({
      sbi: 'SBI2',
      grantCode: 'wm',
      grantVersion: '1.0.0',
      allowMultipleApplications: false,
      state: {}
    })

    await up(db)

    const doc = await db.collection(COLLECTION).findOne({ sbi: 'SBI2', grantCode: 'wm' })
    expect(doc.referenceNumber).toBeUndefined()
    expect(doc.applicationRef).toBeUndefined()
  })

  test('drops the legacy indexes and creates the renamed ones', async () => {
    await upMultiApplicationIndexes(db)
    await upLookupIndex(db)
    await upRefLookupIndex(db)

    await up(db)

    const indexNames = (await db.collection(COLLECTION).indexes()).map((i) => i.name)
    expect(indexNames).toContain(MULTI_APP_INDEX_NAME)
    expect(indexNames).toContain(LOOKUP_INDEX_NAME)
    expect(indexNames).toContain(REF_LOOKUP_INDEX_NAME)
    expect(indexNames).not.toContain(LEGACY_MULTI_APP_INDEX_NAME)
    expect(indexNames).not.toContain(LEGACY_LOOKUP_INDEX_NAME)
    expect(indexNames).not.toContain(LEGACY_REF_LOOKUP_INDEX_NAME)
  })

  test('is idempotent', async () => {
    await seedLegacyDocument()
    await upMultiApplicationIndexes(db)
    await upLookupIndex(db)
    await upRefLookupIndex(db)

    await up(db)
    await expect(up(db)).resolves.not.toThrow()

    const doc = await db.collection(COLLECTION).findOne({ sbi: 'SBI1', grantCode: 'wm' })
    expect(doc.referenceNumber).toBe('REF-1')
  })

  test('down renames the field back and restores the legacy indexes', async () => {
    await seedLegacyDocument()
    await upMultiApplicationIndexes(db)
    await upLookupIndex(db)
    await upRefLookupIndex(db)
    await up(db)

    await down(db)

    const doc = await db.collection(COLLECTION).findOne({ sbi: 'SBI1', grantCode: 'wm' })
    expect(doc.applicationRef).toBe('REF-1')
    expect(doc.referenceNumber).toBeUndefined()

    const indexNames = (await db.collection(COLLECTION).indexes()).map((i) => i.name)
    expect(indexNames).toContain(LEGACY_MULTI_APP_INDEX_NAME)
    expect(indexNames).toContain(LEGACY_LOOKUP_INDEX_NAME)
    expect(indexNames).toContain(LEGACY_REF_LOOKUP_INDEX_NAME)
    expect(indexNames).not.toContain(MULTI_APP_INDEX_NAME)
    expect(indexNames).not.toContain(LOOKUP_INDEX_NAME)
    expect(indexNames).not.toContain(REF_LOOKUP_INDEX_NAME)
  })
})
