import { MongoClient, ReadPreference } from 'mongodb'

export const mongoDb = {
  plugin: {
    name: 'mongodb',
    version: '1.0.0',
    multiple: true,
    register: async function (server, options) {
      const decorationKey = options.decorationKey

      server.logger.info('Setting up MongoDb')

      const client = await MongoClient.connect(options.mongoUri, {
        appName: 'grants-ui-backend',
        maxPoolSize: options.maxPoolSize,
        minPoolSize: options.minPoolSize,
        // Fail fast if threads are queued for a connection too long
        waitQueueTimeoutMS: 10_000,
        // Drop idle sockets to keep the pool fresh behind LBs
        maxIdleTimeMS: options.maxIdleTimeMS,
        // Quicker topology selection on failover
        serverSelectionTimeoutMS: 10_000,
        // Retryable reads help on transient primary changes
        retryReads: true,
        retryWrites: false,
        // Prefer secondary but don’t error if there isn’t one
        readPreference: ReadPreference.secondaryPreferred,
        ...(server.secureContext && { secureContext: server.secureContext })
      })

      const databaseName = options.databaseName
      const db = client.db(databaseName)

      server.logger.info(`MongoDb connected to ${databaseName}`)

      server.decorate('server', `${decorationKey}MongoClient`, client)
      server.decorate('server', `${decorationKey}Db`, db)

      server.events.on('stop', async () => {
        server.logger.info('Closing Mongo client')
        try {
          await client.close(true)
        } catch (error) {
          server.logger.debug(`MongoDB client close error: ${error.message}`)
        }
      })
    }
  }
}
