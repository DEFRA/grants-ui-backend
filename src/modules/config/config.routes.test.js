import Hapi from '@hapi/hapi'
import { latestDefinition } from './config.routes.js'
import { resolveLatestVersion, resolveLatestVersionWithinMajor } from './config.service.js'

jest.mock('./config.service.js', () => ({
  resolveLatestVersion: jest.fn(),
  resolveLatestVersionWithinMajor: jest.fn()
}))

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
  test('returns the latest active definition within a major when one is given', async () => {
    const definition = { grantCode: 'test-grant', major: 1, minor: 9, patch: 0, definition: { pages: [] } }
    resolveLatestVersionWithinMajor.mockResolvedValue(definition)
    const response = await server.inject('/definitions/test-grant?major=1')
    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual(definition)
    expect(resolveLatestVersionWithinMajor).toHaveBeenCalledWith('test-grant', 1)
    expect(resolveLatestVersion).not.toHaveBeenCalled()
  })
  test('returns 404 if the major has no active definition', async () => {
    resolveLatestVersionWithinMajor.mockResolvedValue(null)
    expect((await server.inject('/definitions/test-grant?major=7')).statusCode).toBe(404)
  })
  test('rejects a major that is not a whole number', async () => {
    expect((await server.inject('/definitions/test-grant?major=1.5')).statusCode).toBe(400)
    expect((await server.inject('/definitions/test-grant?major=one')).statusCode).toBe(400)
    expect(resolveLatestVersionWithinMajor).not.toHaveBeenCalled()
  })
})
