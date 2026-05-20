import { createMongoSchema } from './mongo-schema.js'

const mongoConfigSchema = createMongoSchema({
  uriDoc: 'URI for grants-ui-config mongodb',
  databaseNameDefault: 'grants-ui-config',
  mongoPrefix: 'MONGO_CONFIG_'
})

export { mongoConfigSchema }
