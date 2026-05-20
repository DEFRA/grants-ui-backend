import { Db, MongoClient } from 'mongodb'
import { createServer } from '../../server.js'
import { Server } from '@hapi/hapi'
import { mongoDb, createStateIndexes } from './mongodb.js'

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

    afterEach(async () => {
      await server.stateDb.collection('grant-application-locks').deleteMany({})
    })

    test('Server should have expected MongoDb decorators', () => {
      expect(server.stateDb).toBeInstanceOf(Db)
      expect(server.stateMongoClient).toBeInstanceOf(MongoClient)
    })

    test('MongoDb should have expected database name', () => {
      expect(server.stateDb.databaseName).toBe('grants-ui-backend')
    })

    test('MongoDb should have expected namespace', () => {
      expect(server.stateDb.namespace).toBe('grants-ui-backend')
    })

    test('creates unique index for application state', async () => {
      const indexes = await server.stateDb.collection('grant-application-state').indexes()
      const uniqueIndex = indexes.find(
        (i) => i.unique && i.key.sbi === 1 && i.key.grantCode === 1 && i.key.grantVersion === 1
      )
      expect(uniqueIndex).toBeDefined()
    })

    test('creates unique index for application submissions', async () => {
      const indexes = await server.stateDb.collection('grant_application_submissions').indexes()
      const uniqueIndex = indexes.find(
        (i) => i.unique && i.key.sbi === 1 && i.key.grantCode === 1 && i.key.grantVersion === 1
      )
      expect(uniqueIndex).toBeDefined()
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

    test('creates unique index for application locks', async () => {
      const indexes = await server.stateDb.collection('grant-application-locks').indexes()
      const uniqueIndex = indexes.find(
        (i) => i.unique && i.key.grantCode === 1 && i.key.grantVersion === 1 && i.key.sbi === 1
      )

      expect(uniqueIndex).toBeDefined()
    })

    test('creates a TTL index on application locks', async () => {
      const indexes = await server.stateDb.collection('grant-application-locks').indexes()
      const ttlIndex = indexes.find((i) => i.key.expiresAt === 1)

      expect(ttlIndex).toBeDefined()
      expect(ttlIndex.expireAfterSeconds).toBe(0)
    })

    test('Server should have expected configDb decorators', () => {
      expect(server.configDb).toBeInstanceOf(Db)
      expect(server.configMongoClient).toBeInstanceOf(MongoClient)
    })

    test('configDb should have expected database name', () => {
      expect(server.configDb.databaseName).toBe('grants-ui-config')
    })

    test('configDb does not create state-specific indexes', async () => {
      // Collection won't exist at all if no indexes were created — that's the expected outcome
      const collections = await server.configDb.listCollections({ name: 'grant-application-state' }).toArray()
      expect(collections).toHaveLength(0)
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
