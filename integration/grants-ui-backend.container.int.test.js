import Wreck from '@hapi/wreck'
import { MongoClient } from 'mongodb'
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'

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
  const credentials = Buffer.from(`${encryptedToken}`).toString('base64')
  return `Bearer ${credentials}`
}

const LOCK_SECRET = 'default-lock-token-secret'
const TEST_CONTACT_ID = 'auth-test-user'

const createLockToken = ({ sub, sbi, grantCode, grantVersion }) =>
  jwt.sign(
    {
      sub,
      sbi,
      grantCode,
      grantVersion,
      typ: 'lock'
    },
    LOCK_SECRET,
    {
      issuer: 'grants-ui',
      audience: 'grants-backend'
    }
  )

beforeAll(async () => {
  process.env.GRANTS_UI_BACKEND_AUTH_TOKEN = TEST_AUTH_TOKEN
  process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY

  apiUrl = process.env.API_URL

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
      sbi: 'biz-1',
      grantCode: 'grant-1',
      grantVersion: 1,
      state: { step: 'start' }
    }

    const response = await Wreck.post(`${apiUrl}/state`, {
      json: true,
      payload,
      headers: {
        authorization: createAuthHeader(),
        'x-application-lock-owner': createLockToken({
          sub: TEST_CONTACT_ID,
          sbi: payload.sbi,
          grantCode: payload.grantCode,
          grantVersion: payload.grantVersion
        })
      }
    })

    expect(response.res.statusCode).toBe(201)
    expect(response.payload).toEqual({ success: true, created: true })

    const doc = await db.collection('grant-application-state').findOne({
      sbi: 'biz-1',
      grantCode: 'grant-1',
      grantVersion: 1
    })
    expect(doc.state).toEqual({ step: 'start' })
  })

  it('updates an existing state', async () => {
    const payload = {
      sbi: 'biz-1',
      grantCode: 'grant-1',
      grantVersion: 1,
      state: { step: 'start' }
    }
    await db.collection('grant-application-state').insertOne({
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date()
    })

    const response = await Wreck.post(`${apiUrl}/state`, {
      json: true,
      payload: {
        sbi: 'biz-1',
        grantCode: 'grant-1',
        grantVersion: 1,
        state: { step: 'middle' }
      },
      headers: {
        authorization: createAuthHeader(),
        'x-application-lock-owner': createLockToken({
          sub: TEST_CONTACT_ID,
          sbi: payload.sbi,
          grantCode: payload.grantCode,
          grantVersion: payload.grantVersion
        })
      }
    })

    expect(response.res.statusCode).toBe(200)
    expect(response.payload).toEqual({ success: true, updated: true })

    const doc = await db.collection('grant-application-state').findOne({
      sbi: 'biz-1',
      grantCode: 'grant-1',
      grantVersion: 1
    })
    expect(doc.state).toEqual({ step: 'middle' })
  })
})

describe('GET /state', () => {
  it('retrieves state', async () => {
    const payload = {
      sbi: 'biz-1',
      grantCode: 'grant-1',
      grantVersion: 1,
      state: { step: 'start' }
    }
    await db.collection('grant-application-state').insertMany([
      {
        ...payload,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ])

    const qs = new URLSearchParams({
      sbi: 'biz-1',
      grantCode: 'grant-1'
    }).toString()

    const response = await Wreck.get(`${apiUrl}/state?${qs}`, {
      json: true,
      headers: {
        authorization: createAuthHeader(),
        'x-application-lock-owner': createLockToken({
          sub: TEST_CONTACT_ID,
          sbi: payload.sbi,
          grantCode: payload.grantCode,
          grantVersion: payload.grantVersion
        })
      }
    })

    expect(response.res.statusCode).toBe(200)
    expect(response.payload).toEqual({ step: 'start' })
  })
})

describe('DELETE /state', () => {
  it('deletes state', async () => {
    const payload = {
      sbi: 'biz-1',
      grantCode: 'grant-1',
      grantVersion: 1,
      state: { step: 'start' }
    }
    await db.collection('grant-application-state').insertOne({
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date()
    })

    const qs = new URLSearchParams({
      sbi: 'biz-1',
      grantCode: 'grant-1'
    }).toString()

    const response = await Wreck.delete(`${apiUrl}/state?${qs}`, {
      json: true,
      headers: {
        authorization: createAuthHeader(),
        'x-application-lock-owner': createLockToken({
          sub: TEST_CONTACT_ID,
          sbi: payload.sbi,
          grantCode: payload.grantCode,
          grantVersion: payload.grantVersion
        })
      }
    })

    expect(response.res.statusCode).toBe(200)
    expect(response.payload).toEqual({ success: true, deleted: true })

    const doc = await db.collection('grant-application-state').findOne({ sbi: 'biz-1' })
    expect(doc).toBeNull()
  })
})
