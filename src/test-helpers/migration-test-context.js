import { MongoClient } from 'mongodb'

/**
 * Registers the shared lifecycle used by the migration tests.
 * @param options {{ dbName: string, collection: string }} the test database name and collection to clear
 * @returns {{ db: import('mongodb').Db, consoleInfo: import('@jest/globals').jest.SpyInstance }} the live test context
 */
export const setupMigrationTestContext = ({ dbName, collection }) => {
  const context = { db: undefined, consoleInfo: undefined }
  let connection

  beforeAll(async () => {
    connection = await MongoClient.connect(process.env.MONGO_URI)
    context.db = connection.db(dbName)
  })

  afterAll(async () => {
    await connection.close()
  })

  beforeEach(async () => {
    context.consoleInfo = jest.spyOn(console, 'info').mockImplementation(() => {})
    await context.db.collection(collection).deleteMany({})
  })

  afterEach(() => {
    context.consoleInfo.mockRestore()
  })

  return context
}
