import jwt from 'jsonwebtoken'
import { verifyLockToken } from './lock-token.js'
import { config } from '../../../config.js'

jest.mock('../../../config.js', () => ({
  config: {
    get: jest.fn()
  }
}))

describe('verifyLockToken', () => {
  const SECRET = 'test-lock-secret'

  beforeEach(() => {
    config.get.mockReturnValue(SECRET)
  })

  it('verifies and decodes a valid lock token', () => {
    const token = jwt.sign(
      {
        sub: 'user-1',
        sbi: '106514040',
        grantCode: 'EGWA',
        typ: 'lock'
      },
      SECRET,
      {
        issuer: 'grants-ui',
        audience: 'grants-backend'
      }
    )

    const payload = verifyLockToken(token)

    expect(payload.sub).toBe('user-1')
    expect(payload.sbi).toBe('106514040')
    expect(payload.grantCode).toBe('EGWA')
  })

  it('throws if token is signed with wrong secret', () => {
    const token = jwt.sign({ sub: 'user-1', sbi: '106514040', grantCode: 'EGWA' }, 'wrong-secret', {
      issuer: 'grants-ui',
      audience: 'grants-backend'
    })

    expect(() => verifyLockToken(token)).toThrow()
  })

  it('throws if issuer is invalid', () => {
    const token = jwt.sign({ sub: 'user-1', sbi: '106514040', grantCode: 'EGWA' }, SECRET, {
      issuer: 'someone-else',
      audience: 'grants-backend'
    })

    expect(() => verifyLockToken(token)).toThrow()
  })

  it('throws if audience is invalid', () => {
    const token = jwt.sign({ sub: 'user-1', sbi: '106514040', grantCode: 'EGWA' }, SECRET, {
      issuer: 'grants-ui',
      audience: 'some-other-service'
    })

    expect(() => verifyLockToken(token)).toThrow()
  })

  it('throws on malformed token', () => {
    expect(() => verifyLockToken('not-a-jwt')).toThrow()
  })
})
