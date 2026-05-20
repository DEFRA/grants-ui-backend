function createMongoSchema({ uriDoc, databaseNameDefault, mongoPrefix }) {
  return {
    uri: {
      doc: uriDoc,
      format: String,
      default: 'mongodb://127.0.0.1:27017',
      env: 'MONGO_URI' // All schemas use the same MONGO_URI env var as CDP only expects one mongo
    },
    databaseName: {
      doc: `Database name for ${databaseNameDefault} mongodb`,
      format: String,
      default: databaseNameDefault,
      env: `${mongoPrefix}DATABASE`
    },
    maxPoolSize: {
      doc: 'Max connection pool size',
      format: Number,
      default: 25,
      env: `${mongoPrefix}MAX_POOL_SIZE`
    },
    minPoolSize: {
      doc: 'Min connection pool size',
      format: Number,
      default: 5,
      env: `${mongoPrefix}MIN_POOL_SIZE`
    },
    maxIdleTimeMS: {
      doc: 'Max idle time for connections in the pool (ms)',
      format: Number,
      default: 60_000,
      env: `${mongoPrefix}MAX_IDLE_TIME_MS`
    }
  }
}

export { createMongoSchema }
