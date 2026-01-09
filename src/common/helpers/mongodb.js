import { MongoClient, ReadPreference } from 'mongodb'

import { config } from '../../config.js'

const mongoConfig = config.get('mongo')

export const mongoDb = {
  plugin: {
    name: 'mongodb',
    version: '1.0.0',
    register: async function (server, options) {
      server.logger.info('Setting up MongoDb')

      const client = await MongoClient.connect(options.mongoUri, {
        appName: 'grants-ui-backend',
        maxPoolSize: options.maxPoolSize,
        minPoolSize: options.minPoolSize,
        // Fail fast if threads are queued for a connection too long
        waitQueueTimeoutMS: 200,
        // Drop idle sockets to keep the pool fresh behind LBs
        maxIdleTimeMS: options.maxIdleTimeMS,
        // Quicker topology selection on failover
        serverSelectionTimeoutMS: 5_000,
        // Retryable reads help on transient primary changes
        retryReads: true,
        retryWrites: false,
        // Prefer secondary but don’t error if there isn’t one
        readPreference: ReadPreference.secondaryPreferred,
        ...(server.secureContext && { secureContext: server.secureContext })
      })

      const databaseName = options.databaseName
      const db = client.db(databaseName)

      await createIndexes(db)

      server.logger.info(`MongoDb connected to ${databaseName}`)

      server.decorate('server', 'mongoClient', client)
      server.decorate('server', 'db', db)
      server.decorate('request', 'db', () => db, { apply: true })

      server.events.on('stop', async () => {
        server.logger.info('Closing Mongo client')
        try {
          await client.close(true)
        } catch (error) {
          server.logger.debug(`MongoDB client close error: ${error.message}`)
        }
      })
    }
  },
  options: {
    mongoUri: mongoConfig.uri,
    databaseName: mongoConfig.databaseName,
    maxPoolSize: mongoConfig.maxPoolSize,
    minPoolSize: mongoConfig.minPoolSize,
    maxIdleTimeMS: mongoConfig.maxIdleTimeMS
  }
}

async function createIndexes(db) {
  await db.collection('grant-application-locks').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  await db
    .collection('grant-application-locks')
    .createIndex({ grantCode: 1, grantVersion: 1, sbi: 1 }, { unique: true })

  await db
    .collection('grant-application-state')
    .createIndex({ sbi: 1, grantCode: 1, grantVersion: 1 }, { unique: true })

  await db
    .collection('grant_application_submissions')
    .createIndex({ sbi: 1, grantCode: 1, grantVersion: 1 }, { unique: true })
}
