import { TEST_AUTH_TOKEN, TEST_ENCRYPTION_KEY, APPLICATION_LOCK_TOKEN_SECRET } from '../test-helpers/auth-constants.js'
import { acquireOrRefreshApplicationLock } from '../common/helpers/application-lock.js'
import { enforceApplicationLock } from './application-lock-enforcement.js'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'

function createLockToken({ sub = 'user-1', sbi = '123456789', grantCode = 'EGWA', grantVersion = 1 } = {}) {
  return jwt.sign(
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
}

describe('applicationLockPlugin (JWT-based locking)', () => {
  let server

  beforeAll(async () => {
    process.env.GRANTS_UI_BACKEND_AUTH_TOKEN = TEST_AUTH_TOKEN
    process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    process.env.APPLICATION_LOCK_TOKEN_SECRET = APPLICATION_LOCK_TOKEN_SECRET
    config.set('applicationLock.secret', process.env.APPLICATION_LOCK_TOKEN_SECRET)
    const { createServer } = await import('../server.js')
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

    server.route({
      method: 'POST',
      path: '/test',
      options: { pre: [{ method: enforceApplicationLock }] },
      handler: () => ({ ok: true })
    })
  })

  afterEach(async () => {
    await server.db.collection('grant-application-locks').deleteMany({})
    await server.db.collection('grant_application_submissions').deleteMany({})
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
      APPLICATION_LOCK_TOKEN_SECRET,
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
      APPLICATION_LOCK_TOKEN_SECRET,
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

    const token = createLockToken({ sub: 'user-2', sbi: '123456789', grantCode: 'EGWA', grantVersion: 3 })

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

    const token = createLockToken({ sub: 'user-1', sbi: '123456789', grantCode: 'EGWA', grantVersion: 3 })

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
