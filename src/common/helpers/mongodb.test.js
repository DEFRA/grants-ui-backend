import { Db, MongoClient } from 'mongodb'
import { createServer } from '../../server.js'
import { Server } from '@hapi/hapi'
import { mongoDb } from './mongodb.js'

describe('#mongoDb', () => {
  let server

  describe('Set up', () => {
    beforeAll(async () => {
      server = await createServer()
      await server.initialize()
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
      expect(server.configDb.databaseName).toBe('grants-ui-backend')
    })

    test('MongoDb should have expected namespace', () => {
      expect(server.stateDb.namespace).toBe('grants-ui-backend')
      expect(server.configDb.namespace).toBe('grants-ui-backend')
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
        readPreference: 'secondary'
      })

      expect(server.stateMongoClient).toBeDefined()
      expect(server.stateDb).toBeDefined()

      await server.stateMongoClient.close()
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
