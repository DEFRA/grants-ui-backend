import { WebIdentityTokenProvider } from '@defra/hapi-auth-oidc'
import { config } from '../../../config.js'
import { clearCachedBrokerServiceToken, getBrokerServiceToken } from './broker-service-token.js'

const mockGetCredentials = jest.fn()

jest.mock('@defra/hapi-auth-oidc', () => ({
  WebIdentityTokenProvider: jest.fn().mockImplementation(function WebIdentityTokenProvider() {
    this.getCredentials = mockGetCredentials
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
  'configBroker.webIdentity.audience': 'grants-config-broker'
}

describe('broker-service-token', () => {
  beforeEach(() => {
    clearCachedBrokerServiceToken()
    config.get.mockImplementation((key) => configValues[key])
    mockGetCredentials.mockReset()
    WebIdentityTokenProvider.mockClear()
    mockLogger.info.mockClear()
    mockLogger.warn.mockClear()
    mockLogger.error.mockClear()
  })

  describe('getBrokerServiceToken', () => {
    test('creates the provider with the configured audience', async () => {
      mockGetCredentials.mockResolvedValue('a-token')

      await getBrokerServiceToken()

      expect(WebIdentityTokenProvider).toHaveBeenCalledWith({
        audience: ['grants-config-broker']
      })
    })

    test('returns the token from the provider', async () => {
      mockGetCredentials.mockResolvedValue('a-token')

      const token = await getBrokerServiceToken()

      expect(token).toBe('a-token')
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('audience=grants-config-broker'))
    })

    test('reuses the same provider instance across calls', async () => {
      mockGetCredentials.mockResolvedValue('a-token')

      await getBrokerServiceToken()
      await getBrokerServiceToken()

      expect(WebIdentityTokenProvider).toHaveBeenCalledTimes(1)
      expect(mockGetCredentials).toHaveBeenCalledTimes(2)
    })

    test('logs a warning and returns undefined when no token is available', async () => {
      mockGetCredentials.mockResolvedValue(null)

      const token = await getBrokerServiceToken()

      expect(token).toBeUndefined()
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('no Web Identity token available'))
    })

    test('passes our logger through to the provider so its own [Web Identity] logs are captured', async () => {
      mockGetCredentials.mockResolvedValue('a-token')

      await getBrokerServiceToken()

      expect(mockGetCredentials).toHaveBeenCalledWith(mockLogger)
    })

    test('does not throw if the provider resolves with no token (matches WebIdentityTokenProvider swallowing STS errors internally)', async () => {
      mockGetCredentials.mockResolvedValue(undefined)

      await expect(getBrokerServiceToken()).resolves.toBeUndefined()
    })
  })
})
