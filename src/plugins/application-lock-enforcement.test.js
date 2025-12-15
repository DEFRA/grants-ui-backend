import { acquireApplicationLock } from '../common/helpers/application-lock.js'
import { enforceApplicationLock } from './application-lock-enforcement.js'
import { createServer } from '../server.js'

describe('applicationLockPlugin', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()

    // Mock an example route using the plugin's enforcement
    server.route({
      method: 'GET',
      path: '/test/{grantCode}/{grantVersion}/{sbi}',
      options: {
        pre: [{ method: enforceApplicationLock }]
      },
      handler: () => ({ ok: true })
    })
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  afterEach(async () => {
    await server.db.collection('application-locks').deleteMany({})
  })

  test('allows access when lock can be acquired', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/test/EGWA/1/106514040',
      auth: {
        credentials: { contactId: 'user-1' },
        strategy: 'default'
      }
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ ok: true })
  })

  test('blocks access when lock is owned by another user', async () => {
    const db = server.db

    // user-1 acquires the lock manually
    await acquireApplicationLock(db, {
      grantCode: 'EGWA',
      grantVersion: 1,
      sbi: '106514040',
      ownerId: 'user-1'
    })

    // user-2 tries to hit the same route
    const res = await server.inject({
      method: 'GET',
      url: '/test/EGWA/1/106514040',
      auth: {
        credentials: { contactId: 'user-2' },
        strategy: 'default'
      }
    })

    expect(res.statusCode).toBe(423)
  })

  test('allows same user to refresh their own lock', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/test/EGWA/1/106514040',
      auth: {
        credentials: { contactId: 'user-1' },
        strategy: 'default'
      }
    })

    expect(res.statusCode).toBe(200)
  })
})
