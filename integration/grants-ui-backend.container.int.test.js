import Wreck from '@hapi/wreck'
import {
  TEST_AUTH_TOKEN,
  TEST_ENCRYPTION_KEY,
  APPLICATION_LOCK_TOKEN_SECRET
} from '../src/test-helpers/auth-constants.js'
import { MongoClient } from 'mongodb'
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'

let db
let apiUrl
let client

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
    APPLICATION_LOCK_TOKEN_SECRET,
    {
      issuer: 'grants-ui',
      audience: 'grants-backend'
    }
  )

const createLockReleaseToken = ({ sub }) =>
  jwt.sign(
    {
      sub,
      typ: 'lock-release'
    },
    APPLICATION_LOCK_TOKEN_SECRET,
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
  await db.collection('grant-application-locks').deleteMany({})
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

describe('PATCH /state/{sbi}/{grantCode}', () => {
  it('patches applicationStatus on existing state', async () => {
    await db.collection('grant-application-state').insertOne({
      sbi: 'biz-1',
      grantCode: 'grant-1',
      grantVersion: 1,
      state: {
        applicationStatus: 'DRAFT'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    })

    const response = await Wreck.patch(`${apiUrl}/state/biz-1/grant-1`, {
      json: true,
      payload: {
        state: {
          applicationStatus: 'SUBMITTED'
        }
      },
      headers: {
        authorization: createAuthHeader(),
        'x-application-lock-owner': createLockToken({
          sub: TEST_CONTACT_ID,
          sbi: 'biz-1',
          grantCode: 'grant-1',
          grantVersion: 1
        })
      }
    })

    expect(response.res.statusCode).toBe(200)
    expect(response.payload).toEqual({ success: true, patched: true })

    const doc = await db.collection('grant-application-state').findOne({
      sbi: 'biz-1',
      grantCode: 'grant-1'
    })

    expect(doc.state.applicationStatus).toBe('SUBMITTED')
  })
})

describe('DELETE /admin/application-lock', () => {
  it('removes a specific application lock', async () => {
    await db.collection('grant-application-locks').insertOne({
      sbi: 'biz-1',
      grantCode: 'grant-1',
      grantVersion: 1,
      ownerId: TEST_CONTACT_ID,
      lockedAt: new Date(),
      expiresAt: new Date(Date.now() + 60000)
    })

    const qs = new URLSearchParams({
      sbi: 'biz-1',
      ownerId: TEST_CONTACT_ID,
      grantCode: 'grant-1',
      grantVersion: 1
    }).toString()

    const response = await Wreck.delete(`${apiUrl}/admin/application-lock?${qs}`, {
      json: true,
      headers: {
        authorization: createAuthHeader()
      }
    })

    expect(response.res.statusCode).toBe(200)
    expect(response.payload).toEqual({
      success: true,
      released: true
    })

    const lock = await db.collection('grant-application-locks').findOne({ sbi: 'biz-1' })

    expect(lock).toBeNull()
  })
})

describe('DELETE /application-locks', () => {
  it('releases all locks for an owner', async () => {
    await db.collection('grant-application-locks').insertMany([
      {
        sbi: 'biz-1',
        grantCode: 'grant-1',
        grantVersion: 1,
        ownerId: TEST_CONTACT_ID,
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + 60000)
      },
      {
        sbi: 'biz-2',
        grantCode: 'grant-2',
        grantVersion: 1,
        ownerId: TEST_CONTACT_ID,
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + 60000)
      }
    ])

    const response = await Wreck.delete(`${apiUrl}/application-locks`, {
      json: true,
      headers: {
        authorization: createAuthHeader(),
        'x-application-lock-release': createLockReleaseToken({
          sub: TEST_CONTACT_ID
        })
      }
    })

    expect(response.res.statusCode).toBe(200)
    expect(response.payload).toEqual({
      success: true,
      deletedCount: 2
    })

    const remaining = await db.collection('grant-application-locks').find({ ownerId: TEST_CONTACT_ID }).toArray()

    expect(remaining).toHaveLength(0)
  })
})
