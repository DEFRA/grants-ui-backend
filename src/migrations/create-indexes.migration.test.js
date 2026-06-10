/**
 * Tests for the `create-indexes` migrate-mongo migrations (state + config).
 *
 * These tests are intentionally NOT co-located with the migrations themselves.
 * The migration files live in the repo-root `migrations/` directory because
 * migrate-mongo loads them from there at startup, and that directory is outside
 * Jest's `src/` test roots. Keeping the spec under `src/migrations/` lets Jest
 * discover and run it while it imports the migrations' `up` via the `~`
 * (project-root) path alias.
 */
import { MongoClient } from 'mongodb'
import { up as upStateIndexes } from '~/migrations/state/20260603163943-create-indexes.js'
import { up as upConfigIndexes } from '~/migrations/config/20260603163943-create-indexes.js'

describe('create-indexes migrations', () => {
  let connection
  let db

  beforeAll(async () => {
    connection = await MongoClient.connect(process.env.MONGO_URI)
    db = connection.db('create-indexes-migration-test')
  })

  afterAll(async () => {
    await connection.close()
  })

  test('state migration creates the expected indexes and is idempotent', async () => {
    await upStateIndexes(db)
    await upStateIndexes(db)

    const lockIndexes = await db.collection('grant-application-locks').indexes()
    expect(lockIndexes.find((i) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0)).toBeDefined()
    expect(
      lockIndexes.find((i) => i.unique && i.key.grantCode === 1 && i.key.grantVersion === 1 && i.key.sbi === 1)
    ).toBeDefined()

    const stateIndexes = await db.collection('grant-application-state').indexes()
    expect(
      stateIndexes.find((i) => i.unique && i.key.sbi === 1 && i.key.grantCode === 1 && i.key.grantVersion === 1)
    ).toBeDefined()

    const submissionIndexes = await db.collection('grant_application_submissions').indexes()
    expect(submissionIndexes.find((i) => i.unique && i.key.referenceNumber === 1)).toBeDefined()
  })

  test('config migration creates the expected indexes and is idempotent', async () => {
    await upConfigIndexes(db)
    await upConfigIndexes(db)

    const indexes = await db.collection('config__form_definitions').indexes()
    expect(
      indexes.find((i) => i.unique && i.key.grantCode === 1 && i.key.status === 1 && i.key.major === -1)
    ).toBeDefined()
    expect(
      indexes.find((i) => i.unique && i.key.grantCode === 1 && i.key.major === 1 && i.key.minor === 1)
    ).toBeDefined()
  })
})
