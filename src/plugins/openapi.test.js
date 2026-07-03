import { TEST_AUTH_TOKEN, TEST_ENCRYPTION_KEY, APPLICATION_LOCK_TOKEN_SECRET } from '../test-helpers/auth-constants.js'

describe('openapi plugin registration', () => {
  const actualFs = jest.requireActual('node:fs')

  beforeEach(() => {
    jest.resetModules()
    jest.doMock('node:fs', () => ({
      ...actualFs,
      readFileSync: jest.fn(actualFs.readFileSync)
    }))
  })

  afterEach(() => {
    jest.dontMock('node:fs')
    jest.resetModules()
  })

  test('throws a clear error when openapi.yaml cannot be read', async () => {
    const { readFileSync } = await import('node:fs')
    readFileSync.mockImplementation(() => {
      throw Object.assign(new Error('no such file'), { code: 'ENOENT' })
    })
    const { openapi } = await import('./openapi.js')
    const fakeServer = { register: jest.fn(), route: jest.fn() }
    await expect(openapi.plugin.register(fakeServer)).rejects.toThrow('Failed to load OpenAPI spec')
  })

  test('throws a clear error when openapi.yaml is empty', async () => {
    const { readFileSync } = await import('node:fs')
    readFileSync.mockImplementation(() => '')
    const { openapi } = await import('./openapi.js')
    const fakeServer = { register: jest.fn(), route: jest.fn() }
    await expect(openapi.plugin.register(fakeServer)).rejects.toThrow('Failed to load OpenAPI spec')
  })

  test('does not throw when the spec has no tags block', async () => {
    const { readFileSync } = await import('node:fs')
    readFileSync.mockImplementation(
      () =>
        'openapi: "3.1.0"\ninfo:\n  title: T\n  version: "1"\npaths:\n  /foo:\n    get:\n      responses:\n        "200":\n          description: ok\n'
    )
    const { openapi } = await import('./openapi.js')
    const fakeServer = { register: jest.fn(), route: jest.fn() }
    await expect(openapi.plugin.register(fakeServer)).resolves.not.toThrow()
  })

  test('sets spec version from SERVICE_VERSION when provided', async () => {
    process.env.SERVICE_VERSION = 'v2.3.4'
    const { openapi } = await import('./openapi.js')
    const routes = []
    const fakeServer = {
      register: jest.fn(),
      route: jest.fn((r) => routes.push(r))
    }
    await openapi.plugin.register(fakeServer)
    const specRoute = routes.find((r) => r.path === '/swagger.json')
    const fakeH = { response: jest.fn().mockReturnValue({ type: jest.fn() }) }
    specRoute.handler(null, fakeH)
    const spec = fakeH.response.mock.calls[0][0]
    expect(spec.info.version).toBe('v2.3.4')
    delete process.env.SERVICE_VERSION
  })
})

describe('OpenAPI documentation routes', () => {
  let server

  beforeAll(async () => {
    process.env.GRANTS_UI_BACKEND_AUTH_TOKEN = TEST_AUTH_TOKEN
    process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    process.env.APPLICATION_LOCK_TOKEN_SECRET = APPLICATION_LOCK_TOKEN_SECRET

    const { createServer } = await import('../server.js')
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  describe('GET /swagger.json', () => {
    test('returns 200 with application/json content type', async () => {
      const response = await server.inject({ method: 'GET', url: '/swagger.json' })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toMatch('application/json')
    })

    test('returns a parsed OpenAPI 3.1 object', async () => {
      const response = await server.inject({ method: 'GET', url: '/swagger.json' })
      const payload = JSON.parse(response.payload)

      expect(payload.openapi).toBe('3.1.0')
      expect(payload.info).toBeDefined()
      expect(payload.paths).toBeDefined()
    })

    test('excludes internal paths, tags, and schemas from the served spec', async () => {
      const response = await server.inject({ method: 'GET', url: '/swagger.json' })
      const payload = JSON.parse(response.payload)

      expect(Object.keys(payload.paths)).not.toContain('/state')
      expect(Object.keys(payload.paths)).not.toContain('/state/with-definition')
      expect(Object.keys(payload.paths)).not.toContain('/submissions')
      expect(Object.keys(payload.paths)).toContain('/allowlist/grants')
      expect(Object.keys(payload.paths)).toContain('/health')

      const tagNames = payload.tags.map((t) => t.name)
      expect(tagNames).not.toContain('State')
      expect(tagNames).not.toContain('Submissions')
      expect(tagNames).toContain('Health')
      expect(tagNames).toContain('Allowlist')

      const schemaNames = Object.keys(payload.components?.schemas ?? {})
      expect(schemaNames).not.toContain('StateSaveRequest')
      expect(schemaNames).not.toContain('Submission')
      expect(schemaNames).toContain('AllowlistGrantsResponse')
      expect(schemaNames).toContain('Grant')

      const securitySchemes = Object.keys(payload.components?.securitySchemes ?? {})
      expect(securitySchemes).not.toContain('lockToken')
      expect(securitySchemes).toContain('bearerAuth')
      expect(securitySchemes).toContain('encryptedAuth')
    })

    test('is accessible without authentication', async () => {
      const response = await server.inject({ method: 'GET', url: '/swagger.json' })

      expect(response.statusCode).not.toBe(401)
    })
  })

  describe('GET /documentation', () => {
    test('serves the Swagger UI index page with absolute asset paths', async () => {
      const response = await server.inject({ method: 'GET', url: '/documentation' })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toMatch('text/html')
      expect(response.payload).toContain('swagger-ui')
      expect(response.payload).toContain('<base href="/documentation/">')
    })

    test('serves the initializer pointing at /swagger.json', async () => {
      const response = await server.inject({ method: 'GET', url: '/documentation/swagger-initializer.js' })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toMatch('javascript')
      expect(response.payload).toContain('/swagger.json')
    })

    test('is accessible without authentication', async () => {
      const response = await server.inject({ method: 'GET', url: '/documentation' })

      expect(response.statusCode).not.toBe(401)
    })
  })
})
