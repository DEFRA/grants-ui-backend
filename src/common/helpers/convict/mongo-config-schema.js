import { createMongoSchema } from './mongo-schema.js'

/*
 * Note: using `grants-ui-backend` for database name as CDP has a constraint
 * that there can only be 1 database per service.
 * Also sharing mongoPrefix between state and config to avoid misconfiguration.
 */
const mongoConfigSchema = createMongoSchema({
  uriDoc: 'URI for config mongodb',
  databaseNameDefault: 'grants-ui-backend',
  mongoPrefix: 'MONGO_'
})

export { mongoConfigSchema }
