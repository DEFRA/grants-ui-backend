import { jest } from '@jest/globals'

describe('#config', () => {
  let originalEnv

  beforeEach(() => {
    originalEnv = process.env
    jest.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  test('should use ecs format in production environment', async () => {
    process.env = { ...originalEnv, NODE_ENV: 'production' }
    const { config } = await import('./config.js')

    expect(config.get('log.format')).toBe('ecs')
  })

  test('should use pino-pretty format in non-production environment', async () => {
    process.env = { ...originalEnv, NODE_ENV: 'development' }
    const { config } = await import('./config.js')

    expect(config.get('log.format')).toBe('pino-pretty')
  })

  test('should use production redact settings in production', async () => {
    process.env = { ...originalEnv, NODE_ENV: 'production' }
    const { config } = await import('./config.js')

    const redactPaths = config.get('log.redact')
    expect(Array.isArray(redactPaths)).toBe(true)
    expect(redactPaths.length).toBeGreaterThan(0)
  })

  test('should use non-production redact settings in development', async () => {
    process.env = { ...originalEnv, NODE_ENV: 'development' }
    const { config } = await import('./config.js')

    const redactPaths = config.get('log.redact')
    expect(Array.isArray(redactPaths)).toBe(true)
  })
})
