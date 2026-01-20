import jwt from 'jsonwebtoken'
import { verifyLockToken, verifyOwnerLockReleaseToken } from './lock-token.js'
import { config } from '../../../config.js'
import { Boom } from '@hapi/boom'

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

describe('verifyOwnerLockReleaseToken', () => {
  const SECRET = 'test-lock-secret'

  beforeEach(() => {
    config.get.mockReturnValue(SECRET)
  })

  it('verifies a valid owner-scoped lock release token', () => {
    const token = jwt.sign(
      {
        sub: 'user-123',
        typ: 'lock-release'
      },
      SECRET,
      {
        issuer: 'grants-ui',
        audience: 'grants-backend'
      }
    )

    const result = verifyOwnerLockReleaseToken(token)

    expect(result).toEqual({
      ownerId: 'user-123'
    })
  })

  it('throws if token typ is not lock-release', () => {
    const token = jwt.sign(
      {
        sub: 'user-123',
        typ: 'lock'
      },
      SECRET,
      {
        issuer: 'grants-ui',
        audience: 'grants-backend'
      }
    )

    expect(() => verifyOwnerLockReleaseToken(token)).toThrow(Boom.Boom)
  })

  it('throws if sub (ownerId) is missing', () => {
    const token = jwt.sign(
      {
        typ: 'lock-release'
      },
      SECRET,
      {
        issuer: 'grants-ui',
        audience: 'grants-backend'
      }
    )

    expect(() => verifyOwnerLockReleaseToken(token)).toThrow(Boom.Boom)
  })

  it('throws if issuer is invalid', () => {
    const token = jwt.sign(
      {
        sub: 'user-123',
        typ: 'lock-release'
      },
      SECRET,
      {
        issuer: 'someone-else',
        audience: 'grants-backend'
      }
    )

    expect(() => verifyOwnerLockReleaseToken(token)).toThrow()
  })

  it('throws if audience is invalid', () => {
    const token = jwt.sign(
      {
        sub: 'user-123',
        typ: 'lock-release'
      },
      SECRET,
      {
        issuer: 'grants-ui',
        audience: 'some-other-service'
      }
    )

    expect(() => verifyOwnerLockReleaseToken(token)).toThrow()
  })

  it('throws on malformed token', () => {
    expect(() => verifyOwnerLockReleaseToken('not-a-jwt')).toThrow()
  })
})
