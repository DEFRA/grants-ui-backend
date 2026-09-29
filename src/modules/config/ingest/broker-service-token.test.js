import jwt from 'jsonwebtoken'
import { MockProvider, WebIdentityTokenProvider } from '@defra/hapi-auth-oidc'
import { config } from '../../../config.js'
import { clearCachedBrokerServiceToken, getBrokerServiceToken } from './broker-service-token.js'

const SECRET = 'test-secret'
const validToken = () => jwt.sign({}, SECRET, { expiresIn: '5m' })
const expiredToken = () => jwt.sign({}, SECRET, { expiresIn: '-5m' })

const mockGetCredentials = jest.fn()
const mockMockProviderGetCredentials = jest.fn()

jest.mock('@defra/hapi-auth-oidc', () => ({
  WebIdentityTokenProvider: jest.fn().mockImplementation(function WebIdentityTokenProvider() {
    this.getCredentials = mockGetCredentials
  }),
  MockProvider: jest.fn().mockImplementation(function MockProvider() {
    this.getCredentials = mockMockProviderGetCredentials
  })
}))

jest.mock('../../../config.js', () => ({
  config: {
    get: jest.fn()
  }
}))

jest.mock('../../../common/helpers/logging/logger.js', () => {
  const singletonLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { createLogger: () => singletonLogger }
})

const { createLogger } = jest.requireMock('../../../common/helpers/logging/logger.js')
const mockLogger = createLogger()

const configValues = {
  'configBroker.webIdentity.audience': 'grants-config-broker',
  'configBroker.requestTimeoutMs': 15_000,
  cdpEnvironment: 'test'
}

describe('broker-service-token', () => {
  beforeEach(() => {
    clearCachedBrokerServiceToken()
    config.get.mockImplementation((key) => configValues[key])
    mockGetCredentials.mockReset()
    mockMockProviderGetCredentials.mockReset()
    WebIdentityTokenProvider.mockClear()
    MockProvider.mockClear()
    mockLogger.info.mockClear()
    mockLogger.warn.mockClear()
    mockLogger.error.mockClear()
  })

  afterEach(() => {
    configValues.cdpEnvironment = 'test'
    configValues['configBroker.requestTimeoutMs'] = 15_000
  })

  describe('getBrokerServiceToken', () => {
    test('creates the provider with the configured audience, a short duration, and an early-refresh window covering a request', async () => {
      mockGetCredentials.mockResolvedValue(validToken())

      await getBrokerServiceToken()

      expect(WebIdentityTokenProvider).toHaveBeenCalledWith({
        audience: ['grants-config-broker'],
        durationSeconds: 60,
        earlyRefreshMs: 20_000
      })
    })

    test('caps earlyRefreshMs so it never crowds out the token duration when the request timeout is large', async () => {
      configValues['configBroker.requestTimeoutMs'] = 120_000
      mockGetCredentials.mockResolvedValue(validToken())

      await getBrokerServiceToken()

      expect(WebIdentityTokenProvider).toHaveBeenCalledWith({
        audience: ['grants-config-broker'],
        durationSeconds: 60,
        earlyRefreshMs: 55_000
      })
    })

    test('returns the token from the provider', async () => {
      const token = validToken()
      mockGetCredentials.mockResolvedValue(token)

      const result = await getBrokerServiceToken()

      expect(result).toBe(token)
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('audience=grants-config-broker'))
    })

    test('reuses the same provider instance across calls', async () => {
      mockGetCredentials.mockResolvedValue(validToken())

      await getBrokerServiceToken()
      await getBrokerServiceToken()

      expect(WebIdentityTokenProvider).toHaveBeenCalledTimes(1)
      expect(mockGetCredentials).toHaveBeenCalledTimes(2)
    })

    test('logs a warning and returns undefined when no token is available', async () => {
      mockGetCredentials.mockResolvedValue(null)

      const token = await getBrokerServiceToken()

      expect(token).toBeUndefined()
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('no valid Web Identity token available'))
    })

    test('passes our logger through to the provider so its own [Web Identity] logs are captured', async () => {
      mockGetCredentials.mockResolvedValue(validToken())

      await getBrokerServiceToken()

      expect(mockGetCredentials).toHaveBeenCalledWith(mockLogger)
    })

    test('does not throw if the provider resolves with no token (matches WebIdentityTokenProvider swallowing STS errors internally)', async () => {
      mockGetCredentials.mockResolvedValue(undefined)

      await expect(getBrokerServiceToken()).resolves.toBeUndefined()
    })

    test('treats a stale token returned after a failed refresh as unavailable, rather than sending it to the broker', async () => {
      mockGetCredentials.mockResolvedValue(expiredToken())

      const token = await getBrokerServiceToken()

      expect(token).toBeUndefined()
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('no valid Web Identity token available'))
    })

    test('treats an undecodable token as invalid', async () => {
      mockGetCredentials.mockResolvedValue('not-a-jwt')

      const token = await getBrokerServiceToken()

      expect(token).toBeUndefined()
    })

    test('logs how close the underlying ECS task credentials were to expiry when no valid token was obtained', async () => {
      mockGetCredentials.mockResolvedValue(null)
      const expiration = new Date(Date.now() + 42_000)
      const mockStsCredentials = jest.fn().mockResolvedValue({ expiration })
      WebIdentityTokenProvider.mockImplementationOnce(function WebIdentityTokenProviderWithSts() {
        this.getCredentials = mockGetCredentials
        this.stsClient = { config: { credentials: mockStsCredentials } }
      })

      await getBrokerServiceToken()

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining(expiration.toISOString()))
    })

    test('does not throw if the provider has no stsClient (e.g. MockProvider)', async () => {
      mockGetCredentials.mockResolvedValue(null)

      await expect(getBrokerServiceToken()).resolves.toBeUndefined()
    })

    test('does not throw if reading the underlying credential expiry itself fails', async () => {
      mockGetCredentials.mockResolvedValue(null)
      const mockStsCredentials = jest.fn().mockRejectedValue(new Error('cannot read credentials'))
      WebIdentityTokenProvider.mockImplementationOnce(function WebIdentityTokenProviderWithSts() {
        this.getCredentials = mockGetCredentials
        this.stsClient = { config: { credentials: mockStsCredentials } }
      })

      await expect(getBrokerServiceToken()).resolves.toBeUndefined()
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('could not read underlying ECS task credential expiry')
      )
    })

    test('uses MockProvider instead of WebIdentityTokenProvider when running locally', async () => {
      configValues.cdpEnvironment = 'local'
      const token = validToken()
      mockMockProviderGetCredentials.mockResolvedValue(token)

      const result = await getBrokerServiceToken()

      expect(result).toBe(token)
      expect(MockProvider).toHaveBeenCalledTimes(1)
      expect(WebIdentityTokenProvider).not.toHaveBeenCalled()
    })
  })
})
