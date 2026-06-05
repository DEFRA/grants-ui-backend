/**
 * Tests for the `use-semver` migrate-mongo migration.
 *
 * These tests are intentionally NOT co-located with the migration itself.
 * The migration files live in the repo-root `migrations/` directory because
 * migrate-mongo loads them from there at startup, and that directory is outside
 * Jest's `src/` test roots. Keeping the spec under `src/migrations/` lets Jest
 * discover and run it while it imports the migration's `up` via the `~`
 * (project-root) path alias.
 */
import { MongoClient } from 'mongodb'
import { up } from '~/migrations/state/20260603163942-use-semver.js'

const STATE_COLLECTION = 'grant-application-state'
const LOCKS_COLLECTION = 'grant-application-locks'
const SUBMISSIONS_COLLECTION = 'grant_application_submissions'

describe('use-semver migration', () => {
  let connection
  let db

  beforeAll(async () => {
    connection = await MongoClient.connect(process.env.MONGO_URI)
    db = connection.db('use-semver-migration-test')
  })

  afterAll(async () => {
    await connection.close()
  })

  beforeEach(async () => {
    await Promise.all([
      db.collection(STATE_COLLECTION).deleteMany({}),
      db.collection(LOCKS_COLLECTION).deleteMany({}),
      db.collection(SUBMISSIONS_COLLECTION).deleteMany({})
    ])
  })

  test('decomposes state grantVersion (integer, string, major-only, full semver)', async () => {
    await db.collection(STATE_COLLECTION).insertMany([
      { _id: 'int', grantVersion: 2 },
      { _id: 'majorString', grantVersion: '3' },
      { _id: 'fullSemver', grantVersion: '4.5.6' },
      { _id: 'unparseable', grantVersion: 'not-a-version' }
    ])

    await up(db)

    const int = await db.collection(STATE_COLLECTION).findOne({ _id: 'int' })
    expect(int).toMatchObject({ grantVersion: '2.0.0', pinnedMajor: 2, major: 2, minor: 0, patch: 0 })

    const majorString = await db.collection(STATE_COLLECTION).findOne({ _id: 'majorString' })
    expect(majorString).toMatchObject({ grantVersion: '3.0.0', pinnedMajor: 3, major: 3, minor: 0, patch: 0 })

    const fullSemver = await db.collection(STATE_COLLECTION).findOne({ _id: 'fullSemver' })
    expect(fullSemver).toMatchObject({ grantVersion: '4.5.6', pinnedMajor: 4, major: 4, minor: 5, patch: 6 })

    const unparseable = await db.collection(STATE_COLLECTION).findOne({ _id: 'unparseable' })
    expect(unparseable).toMatchObject({ grantVersion: '1.0.0', pinnedMajor: 1, major: 1, minor: 0, patch: 0 })
  })

  test('normalises locks and submissions grantVersion to a semver string only', async () => {
    await db.collection(LOCKS_COLLECTION).insertOne({ _id: 'lock', grantVersion: 1 })
    await db.collection(SUBMISSIONS_COLLECTION).insertOne({ _id: 'sub', grantVersion: '2' })

    await up(db)

    const lock = await db.collection(LOCKS_COLLECTION).findOne({ _id: 'lock' })
    expect(lock.grantVersion).toBe('1.0.0')
    expect(lock.pinnedMajor).toBeUndefined()
    expect(lock.major).toBeUndefined()

    const sub = await db.collection(SUBMISSIONS_COLLECTION).findOne({ _id: 'sub' })
    expect(sub.grantVersion).toBe('2.0.0')
    expect(sub.pinnedMajor).toBeUndefined()
  })

  test('is idempotent when re-run', async () => {
    await db.collection(STATE_COLLECTION).insertOne({ _id: 'int', grantVersion: 2 })

    await up(db)
    const afterFirst = await db.collection(STATE_COLLECTION).findOne({ _id: 'int' })

    await up(db)
    const afterSecond = await db.collection(STATE_COLLECTION).findOne({ _id: 'int' })

    expect(afterSecond).toEqual(afterFirst)
  })
})
