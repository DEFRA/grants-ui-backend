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
    })

    afterAll(async () => {
      await server.stop({ timeout: 0 })
    })

    afterEach(async () => {
      await server.db.collection('grant-application-locks').deleteMany({})
    })

    test('Server should have expected MongoDb decorators', () => {
      expect(server.db).toBeInstanceOf(Db)
      expect(server.mongoClient).toBeInstanceOf(MongoClient)
    })

    test('MongoDb should have expected database name', () => {
      expect(server.db.databaseName).toBe('grants-ui-backend')
    })

    test('MongoDb should have expected namespace', () => {
      expect(server.db.namespace).toBe('grants-ui-backend')
    })

    test('creates unique index for application state', async () => {
      const indexes = await server.db.collection('grant-application-state').indexes()
      const uniqueIndex = indexes.find(
        (i) => i.unique && i.key.sbi === 1 && i.key.grantCode === 1 && i.key.grantVersion === 1
      )
      expect(uniqueIndex).toBeDefined()
    })

    test('creates unique index for application submissions', async () => {
      const indexes = await server.db.collection('grant_application_submissions').indexes()
      const uniqueIndex = indexes.find(
        (i) => i.unique && i.key.sbi === 1 && i.key.grantCode === 1 && i.key.grantVersion === 1
      )
      expect(uniqueIndex).toBeDefined()
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

    test('creates unique index for application locks', async () => {
      const indexes = await server.db.collection('grant-application-locks').indexes()
      const uniqueIndex = indexes.find(
        (i) => i.unique && i.key.grantCode === 1 && i.key.grantVersion === 1 && i.key.sbi === 1
      )

      expect(uniqueIndex).toBeDefined()
    })

    test('creates a TTL index on application locks', async () => {
      const indexes = await server.db.collection('grant-application-locks').indexes()
      const ttlIndex = indexes.find((i) => i.key.expiresAt === 1)

      expect(ttlIndex).toBeDefined()
      expect(ttlIndex.expireAfterSeconds).toBe(0)
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
