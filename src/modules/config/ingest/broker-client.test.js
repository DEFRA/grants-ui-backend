import { config } from '../../../config.js'
import { getBrokerServiceToken } from './broker-service-token.js'
import { fetchAllGrants, fetchVersion, fetchLatestActiveVersion } from './broker-client.js'

jest.mock('../../../config.js', () => ({
  config: {
    get: jest.fn()
  }
}))

jest.mock('./broker-service-token.js', () => ({
  getBrokerServiceToken: jest.fn()
}))

jest.mock('../../../common/helpers/logging/logger.js', () => {
  const singletonLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { createLogger: () => singletonLogger }
})

const { createLogger } = jest.requireMock('../../../common/helpers/logging/logger.js')
const mockLogger = createLogger()

const configValues = {
  'configBroker.baseUrl': 'https://broker.example/',
  'configBroker.requestTimeoutMs': 5000
}

const okResponse = (body) => ({
  ok: true,
  json: jest.fn().mockResolvedValue(body)
})

describe('broker-client', () => {
  beforeEach(() => {
    config.get.mockImplementation((key) => configValues[key])
    global.fetch = jest.fn()
    mockLogger.info.mockClear()
    mockLogger.warn.mockClear()
    mockLogger.error.mockClear()
    getBrokerServiceToken.mockReset()
  })

  afterEach(() => {
    delete global.fetch
  })

  describe('fetchAllGrants', () => {
    test('requests all grants including drafts and returns the parsed body', async () => {
      getBrokerServiceToken.mockResolvedValue('a-web-identity-token')
      const grants = [{ grant: 'farm-payments', versions: [] }]
      global.fetch.mockResolvedValue(okResponse(grants))

      const result = await fetchAllGrants()

      expect(global.fetch).toHaveBeenCalledWith(
        'https://broker.example/api/allGrants?draft=include',
        expect.objectContaining({ method: 'GET' })
      )
      expect(result).toEqual(grants)
    })

    test('strips trailing slashes from the base URL', async () => {
      getBrokerServiceToken.mockResolvedValue('a-web-identity-token')
      configValues['configBroker.baseUrl'] = 'https://broker.example///'
      global.fetch.mockResolvedValue(okResponse([]))

      await fetchAllGrants()

      expect(global.fetch).toHaveBeenCalledWith(
        'https://broker.example/api/allGrants?draft=include',
        expect.any(Object)
      )
      configValues['configBroker.baseUrl'] = 'https://broker.example/'
    })

    test('sends the Web Identity token as a plain Bearer token', async () => {
      getBrokerServiceToken.mockResolvedValue('a-web-identity-token')
      global.fetch.mockResolvedValue(okResponse([]))

      await fetchAllGrants()

      const [, options] = global.fetch.mock.calls[0]
      expect(getBrokerServiceToken).toHaveBeenCalled()
      expect(options.headers.Authorization).toBe('Bearer a-web-identity-token')

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('authMethod=web_identity'))
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('request succeeded'))
    })

    test('omits the Authorization header when no token is available', async () => {
      getBrokerServiceToken.mockResolvedValue(undefined)
      global.fetch.mockResolvedValue(okResponse([]))

      await fetchAllGrants()

      const [, options] = global.fetch.mock.calls[0]
      expect(options.headers.Authorization).toBeUndefined()
    })

    test('throws when the broker responds with a non-ok status', async () => {
      getBrokerServiceToken.mockResolvedValue('a-web-identity-token')
      global.fetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: jest.fn().mockResolvedValue('unavailable')
      })

      await expect(fetchAllGrants()).rejects.toThrow(/Broker request failed: GET .* -> 503 unavailable/)
    })

    test('logs the status and authMethod when the broker rejects the request', async () => {
      getBrokerServiceToken.mockResolvedValue('a-web-identity-token')
      global.fetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: jest.fn().mockResolvedValue('subject not allow-listed')
      })

      await expect(fetchAllGrants()).rejects.toThrow()

      const [loggedMessage] = mockLogger.error.mock.calls[0]
      expect(loggedMessage).toEqual(expect.stringContaining('authMethod=web_identity'))
      expect(loggedMessage).toEqual(expect.stringContaining('status=403'))
    })
  })

  describe('fetchVersion', () => {
    test('requests a specific grant version', async () => {
      getBrokerServiceToken.mockResolvedValue('a-web-identity-token')
      const version = { grant: 'farm-payments', version: '1.0.0' }
      global.fetch.mockResolvedValue(okResponse(version))

      const result = await fetchVersion('farm-payments', '1.0.0')

      expect(global.fetch).toHaveBeenCalledWith(
        'https://broker.example/api/version?grant=farm-payments&version=1.0.0',
        expect.any(Object)
      )
      expect(result).toEqual(version)
    })
  })

  describe('fetchLatestActiveVersion', () => {
    test('requests the latest active version for a grant', async () => {
      getBrokerServiceToken.mockResolvedValue('a-web-identity-token')
      const version = { grant: 'farm-payments', version: '2.0.0', status: 'active' }
      global.fetch.mockResolvedValue(okResponse(version))

      const result = await fetchLatestActiveVersion('farm-payments')

      expect(global.fetch).toHaveBeenCalledWith(
        'https://broker.example/api/latestVersion?grant=farm-payments',
        expect.any(Object)
      )
      expect(result).toEqual(version)
    })
  })
})
