import jwt from 'jsonwebtoken'
import { decodeEncryptedAuthHeader } from './auth.js'

jest.mock('../common/helpers/logging/log.js', () => {
  const { LogCodes } = jest.requireActual('../common/helpers/logging/log-codes.js')
  return { log: jest.fn(), LogCodes }
})

import { log, LogCodes } from '../common/helpers/logging/log.js'

const SECRET = 'test-secret'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('decodeEncryptedAuthHeader', () => {
  test('returns payload from a valid JWT', () => {
    const token = jwt.sign({ crn: '1234567890', sbi: '123456789' }, SECRET)

    const result = decodeEncryptedAuthHeader(token, SECRET)

    expect(result).toMatchObject({ crn: '1234567890', sbi: '123456789' })
  })

  test('numeric claims are preserved as-is in the raw payload', () => {
    const token = jwt.sign({ crn: 1234567890, sbi: 123456789 }, SECRET)

    const result = decodeEncryptedAuthHeader(token, SECRET)

    expect(result).toMatchObject({ crn: 1234567890, sbi: 123456789 })
  })

  test('returns empty object when header is absent', () => {
    expect(decodeEncryptedAuthHeader(undefined, SECRET)).toEqual({})
    expect(log).not.toHaveBeenCalled()
  })

  test('returns empty object and logs when jwtSecret is not provided', () => {
    const token = jwt.sign({ crn: '1234567890', sbi: '123456789' }, SECRET)

    const result = decodeEncryptedAuthHeader(token, '')

    expect(result).toEqual({})
    expect(log).toHaveBeenCalledWith(
      LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE,
      expect.objectContaining({
        errorName: 'JWT secret not configured'
      })
    )
  })

  test('returns empty object and logs when token signature is invalid', () => {
    const token = jwt.sign({ crn: '1234567890', sbi: '123456789' }, 'wrong-secret')

    const result = decodeEncryptedAuthHeader(token, SECRET)

    expect(result).toEqual({})
    expect(log).toHaveBeenCalledWith(
      LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE,
      expect.objectContaining({
        errorName: 'JsonWebTokenError'
      })
    )
  })

  test('returns empty object and logs when token is expired', () => {
    const token = jwt.sign({ crn: '1234567890', sbi: '123456789' }, SECRET, { expiresIn: -1 })

    const result = decodeEncryptedAuthHeader(token, SECRET)

    expect(result).toEqual({})
    expect(log).toHaveBeenCalledWith(
      LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE,
      expect.objectContaining({
        errorName: 'TokenExpiredError'
      })
    )
  })

  test('returns payload without crn/sbi when claims are missing from token', () => {
    const token = jwt.sign({ sub: 'user' }, SECRET)

    const result = decodeEncryptedAuthHeader(token, SECRET)

    expect(result).not.toHaveProperty('crn')
    expect(result).not.toHaveProperty('sbi')
  })
})

describe('decodeEncryptedAuthHeader — existing endpoint compatibility', () => {
  test('returns empty object when x-encrypted-auth header is absent, leaving existing endpoints unaffected', () => {
    const result = decodeEncryptedAuthHeader(undefined, SECRET)

    expect(result).toEqual({})
  })

  test('crn and sbi are undefined when x-encrypted-auth is absent', () => {
    const payload = decodeEncryptedAuthHeader(undefined, SECRET)
    const crn = typeof payload.crn === 'string' || typeof payload.crn === 'number' ? `${payload.crn}` : undefined
    const sbi = typeof payload.sbi === 'string' || typeof payload.sbi === 'number' ? `${payload.sbi}` : undefined

    expect(crn).toBeUndefined()
    expect(sbi).toBeUndefined()
  })
})
