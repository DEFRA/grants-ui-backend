import { Db, MongoClient } from 'mongodb'
import { TEST_AUTH_TOKEN, TEST_ENCRYPTION_KEY, APPLICATION_LOCK_TOKEN_SECRET } from './test-helpers/auth-constants.js'

describe('server MongoDB setup', () => {
  let server

  beforeAll(async () => {
    process.env.GRANTS_UI_BACKEND_AUTH_TOKEN = TEST_AUTH_TOKEN
    process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    process.env.APPLICATION_LOCK_TOKEN_SECRET = APPLICATION_LOCK_TOKEN_SECRET

    const { createServer } = await import('./server.js')
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  test('server decorates stateDb and configDb on the server instance', () => {
    expect(server.stateDb).toBeInstanceOf(Db)
    expect(server.stateMongoClient).toBeInstanceOf(MongoClient)
    expect(server.configDb).toBeInstanceOf(Db)
    expect(server.configMongoClient).toBeInstanceOf(MongoClient)
  })
})
