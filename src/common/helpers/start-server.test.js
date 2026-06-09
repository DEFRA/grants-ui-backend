import hapi from '@hapi/hapi'

const mockLoggerInfo = jest.fn()
const mockLoggerError = jest.fn()

const mockHapiLoggerInfo = jest.fn()
const mockHapiLoggerError = jest.fn()

jest.mock('hapi-pino', () => ({
  register: (server) => {
    server.decorate('server', 'logger', {
      info: mockHapiLoggerInfo,
      error: mockHapiLoggerError
    })
  },
  name: 'mock-hapi-pino'
}))
jest.mock('./logging/logger.js', () => ({
  createLogger: () => ({
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args)
  })
}))
jest.mock('../../modules/config/ingest/startup-pull.js', () => ({
  runStartupPull: jest.fn().mockResolvedValue(undefined)
}))
jest.mock('./run-migrations.js', () => ({
  runMigrations: jest.fn().mockResolvedValue([])
}))
jest.mock('../../modules/config/ingest/sqs-consumer.js', () => ({
  sqsConsumerPlugin: {
    name: 'config-sqs-consumer',
    register: jest.fn()
  }
}))

describe('#startServer', () => {
  const PROCESS_ENV = process.env
  let createServerSpy
  let hapiServerSpy
  let startServerImport
  let createServerImport

  beforeAll(async () => {
    process.env = { ...PROCESS_ENV }
    process.env.PORT = '3098' // Set to obscure port to avoid conflicts

    createServerImport = await import('../../server.js')
    startServerImport = await import('./start-server.js')

    createServerSpy = jest.spyOn(createServerImport, 'createServer')
    hapiServerSpy = jest.spyOn(hapi, 'server')
  })

  afterAll(() => {
    process.env = PROCESS_ENV
  })

  describe('When server starts', () => {
    let server

    afterAll(async () => {
      await server.stop({ timeout: 0 })
    })

    test('Should start up server as expected', async () => {
      server = await startServerImport.startServer()

      expect(createServerSpy).toHaveBeenCalled()
      expect(hapiServerSpy).toHaveBeenCalled()
      expect(mockHapiLoggerInfo).toHaveBeenCalledWith('Custom secure context is disabled')
      expect(mockHapiLoggerInfo).toHaveBeenCalledWith('MongoDb connected to grants-ui-backend - state')
      expect(mockHapiLoggerInfo).toHaveBeenCalledWith('MongoDb connected to grants-ui-backend - config')
      expect(mockHapiLoggerInfo).toHaveBeenCalledWith('Server started successfully')
      expect(mockHapiLoggerInfo).toHaveBeenCalledWith('Access your backend on http://localhost:3098')
    })
  })

  describe('When server start fails', () => {
    beforeAll(() => {
      createServerSpy.mockRejectedValue(new Error('Server failed to start'))
    })

    test('Should log failed startup message and rethrow to fail boot loudly', async () => {
      await expect(startServerImport.startServer()).rejects.toThrow('Server failed to start')

      expect(mockLoggerError).toHaveBeenCalledWith('Server failed to start :(')
      expect(mockLoggerError).toHaveBeenCalledWith(Error('Server failed to start'))
    })
  })
})
