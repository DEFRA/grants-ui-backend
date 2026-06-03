import { config } from '../../../config.js'
import { buildBrokerBearerHeader } from './broker-auth.js'
import { fetchAllGrants, fetchVersion } from './broker-client.js'

jest.mock('../../../config.js', () => ({
  config: {
    get: jest.fn()
  }
}))

jest.mock('./broker-auth.js', () => ({
  buildBrokerBearerHeader: jest.fn()
}))

const configValues = {
  'configBroker.baseUrl': 'https://broker.example/',
  'configBroker.requestTimeoutMs': 5000,
  'configBroker.authToken': undefined,
  'configBroker.encryptionKey': undefined
}

const okResponse = (body) => ({
  ok: true,
  json: jest.fn().mockResolvedValue(body)
})

describe('broker-client', () => {
  beforeEach(() => {
    config.get.mockImplementation((key) => configValues[key])
    global.fetch = jest.fn()
  })

  afterEach(() => {
    configValues['configBroker.authToken'] = undefined
    configValues['configBroker.encryptionKey'] = undefined
    delete global.fetch
  })

  describe('fetchAllGrants', () => {
    test('requests all grants including drafts and returns the parsed body', async () => {
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
      configValues['configBroker.baseUrl'] = 'https://broker.example///'
      global.fetch.mockResolvedValue(okResponse([]))

      await fetchAllGrants()

      expect(global.fetch).toHaveBeenCalledWith(
        'https://broker.example/api/allGrants?draft=include',
        expect.any(Object)
      )
      configValues['configBroker.baseUrl'] = 'https://broker.example/'
    })

    test('omits the Authorization header when no token/key is configured', async () => {
      global.fetch.mockResolvedValue(okResponse([]))

      await fetchAllGrants()

      const [, options] = global.fetch.mock.calls[0]
      expect(options.headers.Authorization).toBeUndefined()
      expect(buildBrokerBearerHeader).not.toHaveBeenCalled()
    })

    test('adds the Authorization header when token and key are configured', async () => {
      configValues['configBroker.authToken'] = 'token'
      configValues['configBroker.encryptionKey'] = 'key'
      buildBrokerBearerHeader.mockReturnValue('Bearer encrypted')
      global.fetch.mockResolvedValue(okResponse([]))

      await fetchAllGrants()

      const [, options] = global.fetch.mock.calls[0]
      expect(buildBrokerBearerHeader).toHaveBeenCalledWith('token', 'key')
      expect(options.headers.Authorization).toBe('Bearer encrypted')
    })

    test('throws when the broker responds with a non-ok status', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: jest.fn().mockResolvedValue('unavailable')
      })

      await expect(fetchAllGrants()).rejects.toThrow(/Broker request failed: GET .* -> 503 unavailable/)
    })
  })

  describe('fetchVersion', () => {
    test('requests a specific grant version', async () => {
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
})
