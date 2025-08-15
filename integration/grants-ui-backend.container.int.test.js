import Wreck from '@hapi/wreck'
import { MongoClient } from 'mongodb'
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals'

let db
let apiUrl
let client

beforeAll(async () => {
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
      businessId: 'biz-1',
      userId: 'user-1',
      grantId: 'grant-1',
      grantVersion: 1,
      state: { step: 'start' }
    }

    const response = await Wreck.post(`${apiUrl}/state`, {
      json: true,
      payload
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

    const response = await Wreck.get(`${apiUrl}/state?${qs}`, { json: true })

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

    const response = await Wreck.delete(`${apiUrl}/state?${qs}`, { json: true })

    expect(response.res.statusCode).toBe(200)
    expect(response.payload).toEqual({ success: true, deleted: true })

    const doc = await db
      .collection('grant-application-state')
      .findOne({ businessId: 'biz-1' })
    expect(doc).toBeNull()
  })
})
