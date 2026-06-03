import 'dotenv/config'

import { buildBrokerBearerHeader } from '../src/modules/config/ingest/broker-auth.js'

export function generateAuthToken(token, encryptionKey) {
  return buildBrokerBearerHeader(token, encryptionKey).replace(/^Bearer /, '')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const token = process.env.GRANTS_UI_BACKEND_AUTH_TOKEN
  const encryptionKey = process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY

  if (!token || !encryptionKey) {
    throw new Error('Missing auth token or encryption key in environment variables')
  }

  console.log('Authorization: ' + buildBrokerBearerHeader(token, encryptionKey))
}
