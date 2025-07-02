describe('#loggerOptions', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('mixin function with trace ID', async () => {
    jest.doMock('@defra/hapi-tracing', () => ({
      getTraceId: () => 'test-trace-id-123'
    }))

    const { loggerOptions } = await import('./logger-options.js')
    const result = loggerOptions.mixin()

    expect(result).toEqual({
      trace: { id: 'test-trace-id-123' }
    })

    expect(loggerOptions).toHaveProperty('enabled')
    expect(loggerOptions).toHaveProperty('ignorePaths')
    expect(loggerOptions).toHaveProperty('redact')
    expect(loggerOptions).toHaveProperty('level')
    expect(loggerOptions).toHaveProperty('nesting')
    expect(loggerOptions.ignorePaths).toContain('/health')
    expect(typeof loggerOptions.mixin).toBe('function')
  })

  test('mixin function without trace ID (null)', async () => {
    jest.doMock('@defra/hapi-tracing', () => ({
      getTraceId: () => null
    }))

    const { loggerOptions } = await import('./logger-options.js')
    const result = loggerOptions.mixin()

    expect(result).toEqual({})
  })

  test('mixin function without trace ID (undefined)', async () => {
    jest.doMock('@defra/hapi-tracing', () => ({
      getTraceId: () => undefined
    }))

    const { loggerOptions } = await import('./logger-options.js')
    const result = loggerOptions.mixin()

    expect(result).toEqual({})
  })

  test('mixin function with empty string trace ID', async () => {
    jest.doMock('@defra/hapi-tracing', () => ({
      getTraceId: () => ''
    }))

    const { loggerOptions } = await import('./logger-options.js')
    const result = loggerOptions.mixin()

    expect(result).toEqual({})
  })

  test('mixin function with falsy number trace ID', async () => {
    jest.doMock('@defra/hapi-tracing', () => ({
      getTraceId: () => 0
    }))

    const { loggerOptions } = await import('./logger-options.js')
    const result = loggerOptions.mixin()

    expect(result).toEqual({})
  })
})
