import { TEST_AUTH_TOKEN, TEST_ENCRYPTION_KEY, APPLICATION_LOCK_TOKEN_SECRET } from '../test-helpers/auth-constants.js'

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

    test('is accessible without authentication', async () => {
      const response = await server.inject({ method: 'GET', url: '/swagger.json' })

      expect(response.statusCode).not.toBe(401)
    })
  })

  describe('GET /documentation', () => {
    test('serves the Swagger UI index page', async () => {
      const response = await server.inject({ method: 'GET', url: '/documentation' })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toMatch('text/html')
      expect(response.payload).toContain('swagger-ui')
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
