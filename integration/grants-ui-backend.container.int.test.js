import Wreck from '@hapi/wreck'
import { MongoClient } from 'mongodb'
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals'
import crypto from 'crypto'

let db
let apiUrl
let client

const TEST_AUTH_TOKEN = 'test-token-test-token-test-token-test-token-test-t-64-chars-long'
const TEST_ENCRYPTION_KEY = 'test-encryption-key-test-encryption-key-test-encry-64-chars-long'

const encryptToken = (token, encryptionKey) => {
  const iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(encryptionKey, 'salt', 32)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  let encrypted = cipher.update(token, 'utf8', 'base64')
  encrypted += cipher.final('base64')

  const authTag = cipher.getAuthTag()

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
}

const createAuthHeader = () => {
  const encryptedToken = encryptToken(TEST_AUTH_TOKEN, TEST_ENCRYPTION_KEY)
  const credentials = Buffer.from(`:${encryptedToken}`).toString('base64')
  return `Basic ${credentials}`
}

beforeAll(async () => {
  process.env.GRANTS_UI_BACKEND_AUTH_TOKEN = TEST_AUTH_TOKEN
  process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY

  apiUrl = process.env.API_URL
  console.log('Integration Test Setup:')
  console.log(`API URL: ${apiUrl}`)
  console.log(`Auth token set: ${!!process.env.GRANTS_UI_BACKEND_AUTH_TOKEN}`)
  console.log(`Encryption key set: ${!!process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY}`)

  client = await MongoClient.connect(process.env.MONGO_URI)
  db = client.db()
})

afterAll(async () => {
  await client.close() // <- closes the Mongo connection
})

beforeEach(async () => {
  await db.collection('grant-application-state').deleteMany({})
})

describe('POST /state', () => {
  it('creates a new state', async () => {
    const payload = {
      businessId: 'biz-1',
      userId: 'user-1',
      grantId: 'grant-1',
      grantVersion: 1,
      state: { step: 'start' }
    }

    const response = await Wreck.post(`${apiUrl}/state`, {
      json: true,
      payload,
      headers: {
        authorization: createAuthHeader()
      }
    })

    expect(response.res.statusCode).toBe(201)
    expect(response.payload).toEqual({ success: true, created: true })

    const doc = await db.collection('grant-application-state').findOne({
      businessId: 'biz-1',
      userId: 'user-1',
      grantId: 'grant-1',
      grantVersion: 1
    })
    expect(doc.state).toEqual({ step: 'start' })
  })

  it('updates an existing state', async () => {
    await db.collection('grant-application-state').insertOne({
      businessId: 'biz-1',
      userId: 'user-1',
      grantId: 'grant-1',
      grantVersion: 1,
      state: { step: 'start' },
      createdAt: new Date(),
      updatedAt: new Date()
    })

    const response = await Wreck.post(`${apiUrl}/state`, {
      json: true,
      payload: {
        businessId: 'biz-1',
        userId: 'user-1',
        grantId: 'grant-1',
        grantVersion: 1,
        state: { step: 'middle' }
      },
      headers: {
        authorization: createAuthHeader()
      }
    })

    expect(response.res.statusCode).toBe(200)
    expect(response.payload).toEqual({ success: true, updated: true })

    const doc = await db.collection('grant-application-state').findOne({
      businessId: 'biz-1',
      userId: 'user-1',
      grantId: 'grant-1',
      grantVersion: 1
    })
    expect(doc.state).toEqual({ step: 'middle' })
  })
})

describe('GET /state', () => {
  it('retrieves state', async () => {
    await db.collection('grant-application-state').insertMany([
      {
        businessId: 'biz-1',
        userId: 'user-1',
        grantId: 'grant-1',
        grantVersion: 1,
        state: { step: 'start' },
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ])

    const qs = new URLSearchParams({
      businessId: 'biz-1',
      userId: 'user-1',
      grantId: 'grant-1'
    }).toString()

    const response = await Wreck.get(`${apiUrl}/state?${qs}`, {
      json: true,
      headers: {
        authorization: createAuthHeader()
      }
    })

    expect(response.res.statusCode).toBe(200)
    expect(response.payload).toEqual({ step: 'start' })
  })
})

describe('DELETE /state', () => {
  it('deletes state', async () => {
    await db.collection('grant-application-state').insertOne({
      businessId: 'biz-1',
      userId: 'user-1',
      grantId: 'grant-1',
      grantVersion: 1,
      state: { step: 'start' },
      createdAt: new Date(),
      updatedAt: new Date()
    })

    const qs = new URLSearchParams({
      businessId: 'biz-1',
      userId: 'user-1',
      grantId: 'grant-1'
    }).toString()

    const response = await Wreck.delete(`${apiUrl}/state?${qs}`, {
      json: true,
      headers: {
        authorization: createAuthHeader()
      }
    })

    expect(response.res.statusCode).toBe(200)
    expect(response.payload).toEqual({ success: true, deleted: true })

    const doc = await db.collection('grant-application-state').findOne({ businessId: 'biz-1' })
    expect(doc).toBeNull()
  })
})
