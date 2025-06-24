import { createServer } from './server.js'

describe('stateSave handler - payload logging', () => {
  let server
  let loggerInfoSpy
  let loggerWarnSpy

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()

    // Spy on server logger
    loggerInfoSpy = jest
      .spyOn(server.logger, 'info')
      .mockImplementation(() => {})
    loggerWarnSpy = jest
      .spyOn(server.logger, 'warn')
      .mockImplementation(() => {})
  })

  afterAll(async () => {
    await server.stop()
    jest.restoreAllMocks()
  })

  test('logs payload size info for normal request', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/save',
      payload: {
        businessId: 'BIZ123',
        userId: 'USER456',
        grantId: 'GRANT789',
        grantVersion: 'v1',
        state: { a: 'small' },
        relevantState: { b: 'small' }
      },
      headers: {
        'Content-Type': 'application/json'
      }
    })

    expect(response.statusCode).toBe(200)

    // Look for size log
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('payload of size')
    )

    // Should not warn for small payloads
    expect(loggerWarnSpy).not.toHaveBeenCalled()
  })

  test('logs warning for large payload', async () => {
    const largeObj = { foo: 'x'.repeat(600_000) }

    const response = await server.inject({
      method: 'POST',
      url: '/save',
      payload: {
        businessId: 'BIZ123',
        userId: 'USER456',
        grantId: 'GRANT789',
        grantVersion: 'v1',
        state: largeObj,
        relevantState: { b: 'small' }
      }
    })

    expect(response.statusCode).toBe(200)

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Large payload detected'),
      expect.objectContaining({ size: expect.any(Number) })
    )
  })
})
