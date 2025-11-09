import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { log, LogCodes } from '../common/helpers/logging/log.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Seed data is in src/seed-data directory
const SEED_DATA_DIR = path.join(__dirname, '..', 'seed-data')

const COLLECTIONS = {
  STATE: 'grant-application-state',
  SUBMISSIONS: 'grant_application_submissions'
}

/**
 * Reads a JSONL file and returns an array of parsed objects
 * @param {string} filePath - Path to the JSONL file
 * @returns {Promise<Array>} Array of parsed objects
 */
async function readJSONL(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const lines = content.trim().split('\n')
    const data = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line) {
        try {
          data.push(JSON.parse(line))
        } catch (parseError) {
          log(LogCodes.SEED.SEED_PARSE_FAILED, {
            filePath,
            lineNumber: i + 1,
            errorName: parseError.name,
            errorMessage: parseError.message,
            stack: parseError.stack
          })
          throw parseError
        }
      }
    }

    return data
  } catch (error) {
    log(LogCodes.SEED.SEED_FILE_READ_FAILED, {
      filePath,
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack
    })
    throw error
  }
}

/**
 * Seeds a collection by clearing it and inserting data from a JSONL file
 * @param {object} db - MongoDB database instance
 * @param {string} collectionName - Name of the collection
 * @param {string} jsonlFileName - Name of the JSONL file
 * @returns {Promise<number>} Number of documents inserted
 */
async function seedCollection(db, collectionName, jsonlFileName) {
  const collection = db.collection(collectionName)
  const filePath = path.join(SEED_DATA_DIR, jsonlFileName)

  // Clear existing data
  const deleteResult = await collection.deleteMany({})
  log(LogCodes.SEED.SEED_COLLECTION_CLEARED, {
    collection: collectionName,
    deletedCount: deleteResult.deletedCount
  })

  // Read and parse JSONL file
  const data = await readJSONL(filePath)

  // Insert new data
  if (data.length > 0) {
    const insertResult = await collection.insertMany(data)
    log(LogCodes.SEED.SEED_COLLECTION_INSERTED, {
      collection: collectionName,
      insertedCount: insertResult.insertedCount
    })
    return insertResult.insertedCount
  }

  return 0
}

export const seed = {
  method: 'POST',
  path: '/seed',
  options: {
    auth: false, // No authentication required
    description: 'Seed MongoDB collections with data from JSONL files'
  },
  handler: async (request, h) => {
    log(LogCodes.SEED.SEED_STARTED)

    try {
      const db = request.db
      let totalInserted = 0

      // Seed grant-application-state collection
      const stateCount = await seedCollection(db, COLLECTIONS.STATE, 'grant-application-state.jsonl')
      totalInserted += stateCount

      // Seed grant_application_submissions collection
      const submissionsCount = await seedCollection(db, COLLECTIONS.SUBMISSIONS, 'grant_application_submissions.jsonl')
      totalInserted += submissionsCount

      log(LogCodes.SEED.SEED_COMPLETED, { totalInserted })

      return h
        .response({
          success: true,
          message: 'Database seeded successfully',
          collections: {
            [COLLECTIONS.STATE]: stateCount,
            [COLLECTIONS.SUBMISSIONS]: submissionsCount
          },
          totalInserted
        })
        .code(200)
    } catch (error) {
      const isMongoError = error.name === 'MongoError' || error.name === 'MongoServerError'

      log(LogCodes.SEED.SEED_OPERATION_FAILED, {
        collection: 'N/A',
        errorName: error.name,
        errorMessage: error.message,
        errorReason: error.reason || 'N/A',
        errorCode: error.code || 'N/A',
        isMongoError,
        stack: error.stack
      })

      return h
        .response({
          success: false,
          message: 'Failed to seed database',
          error: error.message
        })
        .code(500)
    }
  }
}
