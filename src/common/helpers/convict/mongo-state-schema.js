const mongoStateSchema = {
  uri: {
    doc: 'URI for mongodb',
    format: String,
    default: 'mongodb://127.0.0.1:27017',
    env: 'MONGO_URI'
  },
  databaseName: {
    doc: 'Database name for mongodb',
    format: String,
    default: 'grants-ui-backend',
    env: 'MONGO_DATABASE'
  },
  maxPoolSize: {
    doc: 'Max connection pool size',
    format: Number,
    default: 25,
    env: 'MONGO_MAX_POOL_SIZE'
  },
  minPoolSize: {
    doc: 'Min connection pool size',
    format: Number,
    default: 5,
    env: 'MONGO_MIN_POOL_SIZE'
  },
  maxIdleTimeMS: {
    doc: 'Max idle time for connections in the pool (ms)',
    format: Number,
    default: 60_000,
    env: 'MONGO_MAX_IDLE_TIME_MS'
  }
}

export { mongoStateSchema }
