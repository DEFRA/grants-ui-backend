import { stateRetrieve, stateDelete } from './state.js'
import { MongoClient } from 'mongodb'

describe('State integration tests for latest grantVersion', () => {
  let connection
  let db
  let mockRequest
  let mockH

  const baseQuery = {
    businessId: 'business123',
    userId: 'user123',
    grantId: 'grant123'
  }

  beforeAll(async () => {
    connection = await MongoClient.connect(process.env.MONGO_URI)
    db = connection.db('grants-ui-backend') // use your test DB name

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

  test('stateRetrieve returns document with highest grantVersion', async () => {
    // Insert multiple versions
    await db.collection('grant-application-state').insertMany([
      {
        ...baseQuery,
        grantVersion: 1,
        state: { version: 1 }
      },
      {
        ...baseQuery,
        grantVersion: 3,
        state: { version: 3 }
      },
      {
        ...baseQuery,
        grantVersion: 2,
        state: { version: 2 }
      }
    ])

    await stateRetrieve.handler(mockRequest, mockH)

    expect(mockH.response).toHaveBeenCalledWith({ version: 3 })
    expect(mockH.code).toHaveBeenCalledWith(200)
  })

  test('stateDelete deletes only document with highest grantVersion', async () => {
    // Insert multiple versions
    await db.collection('grant-application-state').insertMany([
      {
        ...baseQuery,
        grantVersion: 1,
        state: { version: 1 }
      },
      {
        ...baseQuery,
        grantVersion: 3,
        state: { version: 3 }
      },
      {
        ...baseQuery,
        grantVersion: 2,
        state: { version: 2 }
      }
    ])

    // Confirm 3 docs inserted
    let count = await db
      .collection('grant-application-state')
      .countDocuments(baseQuery)
    expect(count).toBe(3)

    await stateDelete.handler(mockRequest, mockH)

    // After deletion, highest version doc (grantVersion 3) should be gone
    count = await db
      .collection('grant-application-state')
      .countDocuments(baseQuery)
    expect(count).toBe(2)

    const remainingDocs = await db
      .collection('grant-application-state')
      .find(baseQuery)
      .sort({ grantVersion: 1 })
      .toArray()

    expect(remainingDocs.map((d) => d.grantVersion)).toEqual([1, 2])

    expect(mockH.response).toHaveBeenCalledWith({
      success: true,
      deleted: true
    })
    expect(mockH.code).toHaveBeenCalledWith(200)
  })
})
