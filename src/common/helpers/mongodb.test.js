import { Db, MongoClient } from 'mongodb'
import { createServer } from '../../server.js'
import { Server } from '@hapi/hapi'
import { mongoDb } from './mongodb.js'
import { createStateIndexes } from '../../modules/state/state.repository.js'

describe('#mongoDb', () => {
  let server

  describe('Set up', () => {
    beforeAll(async () => {
      server = await createServer()
      await server.initialize()
      await server.stateMongoIndexesReady
      await server.configMongoIndexesReady
    }, 30_000)

    afterAll(async () => {
      await server.stop({ timeout: 0 })
    })

    test('Server should have expected MongoDb decorators', () => {
      expect(server.stateDb).toBeInstanceOf(Db)
      expect(server.stateMongoClient).toBeInstanceOf(MongoClient)
      expect(server.configDb).toBeInstanceOf(Db)
      expect(server.configMongoClient).toBeInstanceOf(MongoClient)
    })

    test('MongoDb should have expected database name', () => {
      expect(server.stateDb.databaseName).toBe('grants-ui-backend')
      expect(server.configDb.databaseName).toBe('grants-ui-config')
    })

    test('MongoDb should have expected namespace', () => {
      expect(server.stateDb.namespace).toBe('grants-ui-backend')
      expect(server.configDb.namespace).toBe('grants-ui-config')
    })

    test('MongoDb plugin uses secureContext if present', async () => {
      const server = new Server()
      server.logger = {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      }

      server.secureContext = { secure: true }

      await mongoDb.plugin.register(server, {
        decorationKey: 'state',
        mongoUri: global.__MONGO_URI__,
        databaseName: 'test-db',
        retryWrites: false,
        readPreference: 'secondary',
        createIndexes: createStateIndexes
      })

      expect(server.stateMongoClient).toBeDefined()
      expect(server.stateDb).toBeDefined()

      await server.stateMongoClient.close()
    })
  })

  describe('Custom createIndexes option', () => {
    test('calls custom createIndexes function when provided', async () => {
      const customCreateIndexes = jest.fn().mockResolvedValue(undefined)
      const testServer = new Server()
      testServer.logger = {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      }

      await mongoDb.plugin.register(testServer, {
        decorationKey: 'custom',
        mongoUri: global.__MONGO_URI__,
        databaseName: 'test-custom-db',
        createIndexes: customCreateIndexes
      })

      expect(customCreateIndexes).toHaveBeenCalledWith(testServer.customDb)

      await testServer.customMongoClient.close()
    })

    test('no-op createIndexes does not throw', async () => {
      const testServer = new Server()
      testServer.logger = {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      }

      await expect(
        mongoDb.plugin.register(testServer, {
          decorationKey: 'noop',
          mongoUri: global.__MONGO_URI__,
          databaseName: 'test-noop-db',
          createIndexes: async () => {}
        })
      ).resolves.not.toThrow()

      await testServer.noopMongoClient.close()
    })
  })

  describe('Shut down', () => {
    beforeAll(async () => {
      server = await createServer()
      await server.initialize()
    }, 30_000)

    test('Should close Mongo client on server stop', async () => {
      const closeSpy = jest.spyOn(server.stateMongoClient, 'close')
      await server.stop({ timeout: 0 })

      expect(closeSpy).toHaveBeenCalledWith(true)
    })
  })
})
