import { createMongoSchema } from './mongo-schema.js'

const mongoStateSchema = createMongoSchema({
  uriDoc: 'URI for grants-ui-backend (state) mongodb',
  databaseNameDefault: 'grants-ui-backend',
  mongoPrefix: 'MONGO_'
})

export { mongoStateSchema }
