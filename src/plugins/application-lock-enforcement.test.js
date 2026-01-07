import { acquireOrRefreshApplicationLock } from '../common/helpers/application-lock.js'
import { enforceApplicationLock } from './application-lock-enforcement.js'
import { createServer } from '../server.js'
import jwt from 'jsonwebtoken'

const LOCK_SECRET = 'default-lock-token-secret'

function createLockToken({ sub = 'user-1', sbi = '123456789', grantCode = 'EGWA', grantVersion = 1 } = {}) {
  return jwt.sign(
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
}

describe('applicationLockPlugin (JWT-based locking)', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()

    server.route({
      method: 'GET',
      path: '/test',
      options: {
        pre: [{ method: enforceApplicationLock }]
      },
      handler: () => ({ ok: true })
    })
  })

  afterEach(async () => {
    await server.db.collection('grant-application-locks').deleteMany({})
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('401 when lock token header is missing', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/test'
    })

    expect(res.statusCode).toBe(401)
  })

  test('401 when lock token is invalid', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/test',
      headers: {
        'x-application-lock-owner': 'not-a-jwt'
      }
    })

    expect(res.statusCode).toBe(401)
  })

  test('401 when lock token has wrong audience', async () => {
    const badToken = jwt.sign(
      { sub: 'user-1', sbi: '123456789', grantCode: 'EGWA', grantVersion: 1, typ: 'lock' },
      LOCK_SECRET,
      {
        issuer: 'grants-ui',
        audience: 'wrong-audience'
      }
    )

    const res = await server.inject({
      method: 'GET',
      url: '/test',
      headers: {
        'x-application-lock-owner': badToken
      }
    })

    expect(res.statusCode).toBe(401)
  })

  test('rejects lock token with invalid grantVersion', async () => {
    const badToken = jwt.sign(
      { sub: 'user-1', sbi: 'SBI-123', grantCode: 'EGWA', grantVersion: 'not-a-number', typ: 'lock' },
      LOCK_SECRET,
      { issuer: 'grants-ui', audience: 'grants-backend' }
    )

    const res = await server.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-application-lock-owner': badToken }
    })

    expect(res.statusCode).toBe(400)
    expect(res.result.message).toBe('Invalid grantVersion in lock token')
  })

  test('allows access when lock can be acquired', async () => {
    const token = createLockToken({
      sub: 'user-1',
      sbi: '123456789',
      grantCode: 'EGWA',
      grantVersion: 2
    })

    const res = await server.inject({
      method: 'GET',
      url: '/test',
      headers: {
        'x-application-lock-owner': token
      }
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ ok: true })
  })

  test('blocks access when lock is owned by another user', async () => {
    const db = server.db

    await acquireOrRefreshApplicationLock(db, {
      grantCode: 'EGWA',
      grantVersion: 3,
      sbi: '123456789',
      ownerId: 'user-1'
    })

    const token = createLockToken({ sub: 'user-2', grantVersion: 3 })

    const res = await server.inject({
      method: 'GET',
      url: '/test',
      headers: {
        'x-application-lock-owner': token
      }
    })

    expect(res.statusCode).toBe(423)
  })

  test('allows same user to refresh their own lock', async () => {
    const db = server.db

    await acquireOrRefreshApplicationLock(db, {
      grantCode: 'EGWA',
      grantVersion: 4,
      sbi: '123456789',
      ownerId: 'user-1'
    })

    const token = createLockToken({ sub: 'user-1', grantVersion: 4 })

    const res = await server.inject({
      method: 'GET',
      url: '/test',
      headers: {
        'x-application-lock-owner': token
      }
    })

    expect(res.statusCode).toBe(200)
  })
})
