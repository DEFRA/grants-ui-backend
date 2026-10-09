import Hapi from '@hapi/hapi'
import { latestDefinition } from './config.routes.js'
import { resolveLatestVersion } from './config.service.js'

jest.mock('./config.service.js', () => ({ resolveLatestVersion: jest.fn() }))

describe('latest grant definition route', () => {
  let server
  beforeEach(async () => {
    jest.clearAllMocks()
    server = Hapi.server()
    server.auth.scheme('test', () => ({ authenticate: (_request, h) => h.authenticated({ credentials: {} }) }))
    server.auth.strategy('bearer', 'test')
    server.route(latestDefinition)
  })
  test('returns the latest active definition', async () => {
    const definition = { grantCode: 'test-grant', major: 1, minor: 2, patch: 3, definition: { pages: [] } }
    resolveLatestVersion.mockResolvedValue(definition)
    const response = await server.inject('/definitions/test-grant')
    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual(definition)
    expect(resolveLatestVersion).toHaveBeenCalledWith('test-grant')
    expect(latestDefinition.options.auth).toBe('bearer')
  })
  test('returns 404 if there is no active definition', async () => {
    resolveLatestVersion.mockResolvedValue(null)
    expect((await server.inject('/definitions/missing')).statusCode).toBe(404)
  })
})
