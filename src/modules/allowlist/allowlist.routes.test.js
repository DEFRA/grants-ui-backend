import Boom from '@hapi/boom'
import { allowlistGrants } from './allowlist.routes.js'
import { resolveAllowedGrants } from './allowlist.service.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'

jest.mock('./allowlist.service.js', () => ({
  resolveAllowedGrants: jest.fn()
}))

jest.mock('../../common/helpers/logging/log.js', () => {
  const { LogCodes } = jest.requireActual('../../common/helpers/logging/log-codes.js')
  return { log: jest.fn(), LogCodes }
})

const mockRequest = (crn, sbi) => ({ auth: { credentials: { crn, sbi } } })

describe('allowlistGrants route', () => {
  let mockH

  beforeEach(() => {
    jest.clearAllMocks()
    mockH = {
      response: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis()
    }
  })

  describe('handler', () => {
    test('returns 200 with matched grants', async () => {
      const grants = [
        {
          code: 'woodland',
          title: 'Woodland Management Plan',
          description: 'A description.',
          url: 'https://grants-ui.dev.cdp-int.defra.cloud/woodland'
        }
      ]
      resolveAllowedGrants.mockResolvedValue(grants)

      await allowlistGrants.handler(mockRequest('1234567890', '123456789'), mockH)

      expect(resolveAllowedGrants).toHaveBeenCalledWith('123456789')
      expect(mockH.response).toHaveBeenCalledWith({ grants })
      expect(mockH.code).toHaveBeenCalledWith(200)
    })

    test('returns 200 with empty grants array when user has no allowed grants', async () => {
      resolveAllowedGrants.mockResolvedValue([])

      await allowlistGrants.handler(mockRequest('1234567890', '123456789'), mockH)

      expect(mockH.response).toHaveBeenCalledWith({ grants: [] })
      expect(mockH.code).toHaveBeenCalledWith(200)
    })

    test('resolves grants by sbi when crn is missing from token (crn is no longer required)', async () => {
      resolveAllowedGrants.mockResolvedValue([])

      await allowlistGrants.handler(mockRequest(undefined, '123456789'), mockH)

      expect(resolveAllowedGrants).toHaveBeenCalledWith('123456789')
      expect(mockH.code).toHaveBeenCalledWith(200)
      expect(log).not.toHaveBeenCalledWith(LogCodes.ALLOWLIST.GRANTS_UNAUTHORIZED, expect.anything())
    })

    test('ignores crn from token and resolves grants by sbi only', async () => {
      resolveAllowedGrants.mockResolvedValue([])

      await allowlistGrants.handler(mockRequest('1234567890', '123456789'), mockH)

      expect(resolveAllowedGrants).toHaveBeenCalledTimes(1)
      expect(resolveAllowedGrants).toHaveBeenCalledWith('123456789')
    })

    test('throws 401 when sbi is missing from token', async () => {
      await expect(allowlistGrants.handler(mockRequest('1234567890', undefined), mockH)).rejects.toThrow(
        Boom.unauthorized().constructor
      )
      expect(resolveAllowedGrants).not.toHaveBeenCalled()
    })

    test('logs a warning when sbi is missing', async () => {
      await expect(allowlistGrants.handler(mockRequest(undefined, undefined), mockH)).rejects.toThrow()
      expect(log).toHaveBeenCalledWith(LogCodes.ALLOWLIST.GRANTS_UNAUTHORIZED, expect.any(Object))
    })
  })

  describe('route config', () => {
    test('requires bearer auth', () => {
      expect(allowlistGrants.options.auth).toBe('bearer')
    })

    test('is a GET to /allowlist/grants', () => {
      expect(allowlistGrants.method).toBe('GET')
      expect(allowlistGrants.path).toBe('/allowlist/grants')
    })
  })
})
