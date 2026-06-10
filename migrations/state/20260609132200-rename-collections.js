const RENAMES = [
  { from: 'grant-application-state', to: 'state__grant_application_state' },
  { from: 'grant-application-locks', to: 'state__grant_application_locks' },
  { from: 'grant_application_submissions', to: 'state__grant_application_submissions' }
]

/**
 * Renames a collection if (and only if) the source collection exists and the
 * target does not. This makes the migration idempotent and safe to re-run: if
 * the rename has already happened (or the source was never created), it is a
 * no-op rather than an error.
 *
 * @param {import('mongodb').Db} db
 * @param {string} from
 * @param {string} to
 * @returns {Promise<void>}
 */
async function renameIfNeeded(db, from, to) {
  const existing = await db.listCollections({}, { nameOnly: true }).toArray()
  const names = existing.map((c) => c.name)

  if (names.includes(from) && !names.includes(to)) {
    await db.renameCollection(from, to)
  }
}

/**
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const up = async (db, client) => {
  for (const { from, to } of RENAMES) {
    await renameIfNeeded(db, from, to)
  }
}

/**
 * @param db {import('mongodb').Db}
 * @param client {import('mongodb').MongoClient}
 * @returns {Promise<void>}
 */
export const down = async (db, client) => {
  for (const { from, to } of RENAMES) {
    await renameIfNeeded(db, to, from)
  }
}
