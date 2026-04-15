import { stateRetrieve, stateDelete } from './state.js'
import { MongoClient } from 'mongodb'

describe('State integration tests for grantVersion filtering', () => {
  let connection
  let db
  let mockRequest
  let mockH

  const baseQuery = {
    sbi: 'business123',
    grantCode: 'grant123'
  }

  beforeAll(async () => {
    connection = await MongoClient.connect(process.env.MONGO_URI)
    db = connection.db('grants-ui-backend')

    mockH = {
      response: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis()
    }
  })

  afterAll(async () => {
    await connection.close()
  })

  beforeEach(async () => {
    // Clean collection before each test
    await db.collection('grant-application-state').deleteMany({})

    mockRequest = {
      server: { logger: { error: jest.fn() } },
      db,
      query: { ...baseQuery }
    }
  })

  test('stateRetrieve returns document matching the specified grantVersion', async () => {
    await db.collection('grant-application-state').insertMany([
      { ...baseQuery, grantVersion: '1.0.0', state: { version: '1.0.0' } },
      { ...baseQuery, grantVersion: '2.0.3', state: { version: '2.0.3' } },
      { ...baseQuery, grantVersion: '3.1.0', state: { version: '3.1.0' } }
    ])

    mockRequest.query = { ...baseQuery, grantVersion: '2.0.3' }

    await stateRetrieve.handler(mockRequest, mockH)

    expect(mockH.response).toHaveBeenCalledWith({ version: '2.0.3' })
    expect(mockH.code).toHaveBeenCalledWith(200)
  })

  test('stateRetrieve returns 404 when specified grantVersion does not exist', async () => {
    await db.collection('grant-application-state').insertMany([
      { ...baseQuery, grantVersion: '1.0.0', state: { version: '1.0.0' } },
      { ...baseQuery, grantVersion: '2.0.3', state: { version: '2.0.3' } }
    ])

    mockRequest.query = { ...baseQuery, grantVersion: '9.9.9' }

    await stateRetrieve.handler(mockRequest, mockH)

    expect(mockH.response).toHaveBeenCalledWith({ error: 'State not found' })
    expect(mockH.code).toHaveBeenCalledWith(404)
  })

  test('stateDelete deletes only the document matching the specified grantVersion', async () => {
    await db.collection('grant-application-state').insertMany([
      { ...baseQuery, grantVersion: '1.0.0', state: { version: '1.0.0' } },
      { ...baseQuery, grantVersion: '2.0.3', state: { version: '2.0.3' } },
      { ...baseQuery, grantVersion: '3.1.0', state: { version: '3.1.0' } }
    ])

    let count = await db.collection('grant-application-state').countDocuments(baseQuery)
    expect(count).toBe(3)

    mockRequest.query = { ...baseQuery, grantVersion: '2.0.3' }

    await stateDelete.handler(mockRequest, mockH)

    count = await db.collection('grant-application-state').countDocuments(baseQuery)
    expect(count).toBe(2)

    const remainingDocs = await db
      .collection('grant-application-state')
      .find(baseQuery)
      .sort({ grantVersion: 1 })
      .toArray()

    expect(remainingDocs.map((d) => d.grantVersion)).toEqual(['1.0.0', '3.1.0'])

    expect(mockH.response).toHaveBeenCalledWith({ success: true, deleted: true })
    expect(mockH.code).toHaveBeenCalledWith(200)
  })

  test('stateDelete returns 404 when specified grantVersion does not exist', async () => {
    await db
      .collection('grant-application-state')
      .insertMany([{ ...baseQuery, grantVersion: '1.0.0', state: { version: '1.0.0' } }])

    mockRequest.query = { ...baseQuery, grantVersion: '9.9.9' }

    await stateDelete.handler(mockRequest, mockH)

    expect(mockH.response).toHaveBeenCalledWith({ error: 'State not found' })
    expect(mockH.code).toHaveBeenCalledWith(404)
  })
})
