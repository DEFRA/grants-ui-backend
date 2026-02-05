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

describe('GET /submissions', () => {
  it('returns submissions ordered by submittedAt desc', async () => {
    const sbi = crypto.randomUUID()
    const crn1 = crypto.randomUUID()
    const crn2 = crypto.randomUUID()
    const crn3 = crypto.randomUUID()
    const grantCode = 'test-grant'
    const grantVersion = 1

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()

    await db.collection('grant_application_submissions').insertMany([
      {
        sbi,
        crn: crn1,
        grantCode,
        grantVersion,
        referenceNumber: crypto.randomUUID(),
        submittedAt: threeDaysAgo
      },
      {
        sbi,
        crn: crn3,
        grantCode,
        grantVersion,
        referenceNumber: crypto.randomUUID(),
        submittedAt: oneDayAgo
      },
      {
        sbi,
        crn: crn2,
        grantCode,
        grantVersion,
        referenceNumber: crypto.randomUUID(),
        submittedAt: twoDaysAgo
      }
    ])

    const qs = new URLSearchParams({
      sbi,
      grantCode
    }).toString()

    const response = await Wreck.get(`${apiUrl}/submissions?${qs}`, {
      json: true,
      headers: {
        authorization: createAuthHeader()
      }
    })

    expect(response.res.statusCode).toBe(200)
    expect(response.payload).toHaveLength(3)

    expect(response.payload[0].crn).toBe(crn3)
    expect(response.payload[1].crn).toBe(crn2)
    expect(response.payload[2].crn).toBe(crn1)
  })

  it('returns empty array when no submissions exist', async () => {
    const qs = new URLSearchParams({
      sbi: crypto.randomUUID(),
      grantCode: 'test-grant'
    }).toString()

    const response = await Wreck.get(`${apiUrl}/submissions?${qs}`, {
      json: true,
      headers: {
        authorization: createAuthHeader()
      }
    })

    expect(response.res.statusCode).toBe(200)
    expect(response.payload).toEqual([])
  })

  it('returns 401 when authorization header is missing', async () => {
    const response = await Wreck.request('GET', `${apiUrl}/submissions?sbi=123&grantCode=test-grant`, {
      json: true,
      throwOnError: false
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 400 when required query params are missing', async () => {
    const response = await Wreck.request('GET', `${apiUrl}/submissions?sbi=123`, {
      json: true,
      headers: {
        authorization: createAuthHeader()
      },
      throwOnError: false
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns expected observability headers', async () => {
    const response = await Wreck.get(`${apiUrl}/submissions?sbi=${crypto.randomUUID()}&grantCode=test-grant`, {
      json: true,
      headers: {
        authorization: createAuthHeader()
      }
    })

    expect(response.res.statusCode).toBe(200)
    expect(response.res.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(response.res.headers['cache-control']).toBe('no-cache')
  })
})

describe('POST /submissions', () => {
  it('creates a new submission', async () => {
    const payload = {
      sbi: 'biz-1',
      crn: crypto.randomUUID(),
      grantCode: 'test-grant',
      grantVersion: 1,
      referenceNumber: crypto.randomUUID(),
      submittedAt: new Date().toISOString()
    }

    const response = await Wreck.post(`${apiUrl}/submissions`, {
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
  })

  it('returns expected observability headers', async () => {
    const payload = {
      sbi: crypto.randomUUID(),
      crn: crypto.randomUUID(),
      grantCode: 'test-grant',
      grantVersion: 1,
      referenceNumber: crypto.randomUUID(),
      submittedAt: new Date().toISOString()
    }
    const response = await Wreck.post(`${apiUrl}/submissions`, {
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
    expect(response.res.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(response.res.headers['cache-control']).toBe('no-cache')
  })

  it('returns 401 when application lock token is missing', async () => {
    const payload = {
      sbi: crypto.randomUUID(),
      crn: crypto.randomUUID(),
      grantCode: 'test-grant',
      grantVersion: 1,
      referenceNumber: crypto.randomUUID(),
      submittedAt: new Date().toISOString()
    }

    const res = await Wreck.request('POST', `${apiUrl}/submissions`, {
      payload: JSON.stringify(payload),
      headers: {
        authorization: createAuthHeader()
      },
      throwOnError: false
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when authorization header is missing', async () => {
    const response = await Wreck.request('POST', `${apiUrl}/submissions`, {
      json: true,
      payload: {
        sbi: crypto.randomUUID()
      },
      throwOnError: false
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 400 for invalid payload', async () => {
    const response = await Wreck.request('POST', `${apiUrl}/submissions`, {
      json: true,
      payload: {
        invalid: 'payload'
      },
      headers: {
        authorization: createAuthHeader()
      },
      throwOnError: false
    })

    expect(response.statusCode).toBe(400)
  })
})

describe('Observability', () => {
  it('returns successful health response', async () => {
    const response = await Wreck.get(`${apiUrl}/health`, {
      json: true
    })

    expect(response.res.statusCode).toBe(200)
    expect(response.res.headers['content-type']).toContain('application/json')
    expect(response.res.headers['cache-control']).toBe('no-cache')
    expect(response.payload).toEqual({ message: 'success' })
  })

  if (process.env.ENVIRONMENT) {
    it('echoes X-cdp-request-id back in the response', async () => {
      const traceId = crypto.randomUUID().replace(/-/g, '').toLowerCase()

      const response = await Wreck.post(`${apiUrl}/state`, {
        json: true,
        payload: {
          sbi: 'trace-test',
          grantCode: 'trace-grant',
          grantVersion: 1,
          state: {}
        },
        headers: {
          authorization: createAuthHeader(),
          'x-cdp-request-id': traceId,
          'x-application-lock-owner': createLockToken({
            sub: TEST_CONTACT_ID,
            sbi: 'trace-test',
            grantCode: 'trace-grant',
            grantVersion: 1
          })
        }
      })

      expect(response.res.statusCode).toBe(201)
      expect(response.res.headers['x-cdp-request-id']).toBe(traceId)
    })
  }
})
