import { createServer } from '../../server'
import { acquireApplicationLock, refreshApplicationLock, releaseApplicationLock } from './application-lock'

describe('getApplicationLockId', () => {
  let server
  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  afterEach(async () => {
    await server.db.collection('grant-application-locks').deleteMany({})
  })

  test('acquire and release lock', async () => {
    const db = server.db

    const params = {
      grantCode: 'EGWA',
      grantVersion: 1,
      sbi: '106514040',
      ownerId: 'user-1'
    }

    const lock = await acquireApplicationLock(db, params)
    expect(lock).toBeTruthy()

    await releaseApplicationLock(db, params)

    const lock2 = await acquireApplicationLock(db, params)
    expect(lock2).toBeTruthy()
  })

  test('refreshApplicationLock extends expiry', async () => {
    const db = server.db
    const params = { grantCode: 'EGWA', grantVersion: 1, sbi: '106', ownerId: 'user-1' }

    const first = await acquireApplicationLock(db, params)
    const oldExpiry = first.expiresAt

    await new Promise((resolve) => setTimeout(resolve, 10)) // small delay

    const refreshed = await refreshApplicationLock(db, params)
    const doc = await db.collection('grant-application-locks').findOne({ ownerId: 'user-1' })

    expect(refreshed).toBe(true)
    expect(doc.expiresAt.getTime()).toBeGreaterThan(oldExpiry.getTime())
  })

  test('expired lock can be taken over by another user', async () => {
    const db = server.db
    const now = new Date()

    await db.collection('grant-application-locks').insertOne({
      grantCode: 'EGWA',
      grantVersion: 1,
      sbi: '106',
      ownerId: 'user-1',
      lockedAt: now,
      expiresAt: new Date(now.getTime() - 60_000) // expired
    })

    const lock = await acquireApplicationLock(db, {
      grantCode: 'EGWA',
      grantVersion: 1,
      sbi: '106',
      ownerId: 'user-2'
    })

    expect(lock).not.toBeNull()
    expect(lock.ownerId).toBe('user-2')
  })

  test('same user can reacquire their own lock (reentrant)', async () => {
    const db = server.db

    const params = { grantCode: 'EGWA', grantVersion: 1, sbi: '106', ownerId: 'user-1' }

    await acquireApplicationLock(db, params)
    const second = await acquireApplicationLock(db, params)

    expect(second.ownerId).toBe('user-1')
  })
})
