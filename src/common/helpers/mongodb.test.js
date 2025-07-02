import { Db, MongoClient } from 'mongodb'
import { LockManager } from 'mongo-locks'
import { createServer } from '../../server.js'
import { Server } from '@hapi/hapi'
import { mongoDb } from './mongodb.js'

describe('#mongoDb', () => {
  let server

  describe('Set up', () => {
    beforeAll(async () => {
      server = await createServer()
      await server.initialize()
    })

    afterAll(async () => {
      await server.stop({ timeout: 0 })
    })

    test('Server should have expected MongoDb decorators', () => {
      expect(server.db).toBeInstanceOf(Db)
      expect(server.mongoClient).toBeInstanceOf(MongoClient)
      expect(server.locker).toBeInstanceOf(LockManager)
    })

    test('MongoDb should have expected database name', () => {
      expect(server.db.databaseName).toBe('grants-ui-backend')
    })

    test('MongoDb should have expected namespace', () => {
      expect(server.db.namespace).toBe('grants-ui-backend')
    })

    test('MongoDb plugin uses secureContext if present', async () => {
      const server = new Server()
      server.logger = { info: jest.fn() }
      server.secureContext = { secure: true }

      await mongoDb.plugin.register(server, {
        mongoUri: global.__MONGO_URI__,
        databaseName: 'test-db',
        retryWrites: false,
        readPreference: 'secondary'
      })

      expect(server.mongoClient).toBeDefined()
      expect(server.db).toBeDefined()

      await server.mongoClient.close()
    })
  })

  describe('Shut down', () => {
    beforeAll(async () => {
      server = await createServer()
      await server.initialize()
    })

    test('Should close Mongo client on server stop', async () => {
      const closeSpy = jest.spyOn(server.mongoClient, 'close')
      await server.stop({ timeout: 0 })

      expect(closeSpy).toHaveBeenCalledWith(true)
    })
  })
})
