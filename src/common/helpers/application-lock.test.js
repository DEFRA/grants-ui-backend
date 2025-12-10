import { createServer } from '../../server'
import { acquireApplicationLock, getApplicationLockId, releaseApplicationLock } from './application-lock'

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
    await server.db.collection('application-locks').deleteMany({})
  })

  test('generates a lock ID from grantCode, version, and sbi', () => {
    const id = getApplicationLockId('EGWA', 1, '106514040')
    expect(id).toBe('app-lock:EGWA:1:106514040')
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
})
