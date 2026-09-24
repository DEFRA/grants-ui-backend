import { MongoClient } from 'mongodb'
import { up } from '~/migrations/config/20260924000000-create-feature-control-indexes.js'
import { initFeatureControlRepository, upsertFeatureControl, findFeatureControl } from './feature-control.repository.js'

const COLLECTION = 'config__feature_controls'

describe('feature-control repository', () => {
  let connection
  let db

  beforeAll(async () => {
    connection = await MongoClient.connect(process.env.MONGO_URI)
    db = connection.db('grants-ui-feature-control-test')
    await up(db)
    initFeatureControlRepository(db)
  })

  beforeEach(async () => {
    await db.collection(COLLECTION).deleteMany({})
  })

  afterAll(async () => {
    await db
      .collection(COLLECTION)
      .drop()
      .catch(() => {})
    await connection.close()
  })

  test('returns null when no value has been stored', async () => {
    await expect(findFeatureControl('APPLICATION_WINDOW_OPEN_WOODLAND')).resolves.toBeNull()
  })

  test('stores and reads back a value', async () => {
    await upsertFeatureControl({
      name: 'APPLICATION_WINDOW_OPEN_WOODLAND',
      value: false,
      valueType: 'boolean',
      scopes: ['grant.woodland']
    })

    await expect(findFeatureControl('APPLICATION_WINDOW_OPEN_WOODLAND')).resolves.toEqual({
      value: false,
      valueType: 'boolean'
    })
  })

  test('upserting the same name replaces the value without creating a second document', async () => {
    const featureControl = {
      name: 'APPLICATION_WINDOW_OPEN_WOODLAND',
      valueType: 'boolean',
      scopes: ['grant.woodland']
    }

    await upsertFeatureControl({ ...featureControl, value: false })
    await upsertFeatureControl({ ...featureControl, value: true })

    expect(await db.collection(COLLECTION).countDocuments({})).toBe(1)
    await expect(findFeatureControl('APPLICATION_WINDOW_OPEN_WOODLAND')).resolves.toMatchObject({ value: true })
  })
})
