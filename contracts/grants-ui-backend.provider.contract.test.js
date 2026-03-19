import path from 'path'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { Verifier } from '@pact-foundation/pact'
import { fileURLToPath } from 'url'

import {
  TEST_AUTH_TOKEN,
  TEST_ENCRYPTION_KEY,
  APPLICATION_LOCK_TOKEN_SECRET
} from '../src/test-helpers/auth-constants.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function encryptToken(token, encryptionKey) {
  const iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(encryptionKey, 'salt', 32)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  let encrypted = cipher.update(token, 'utf8', 'base64')
  encrypted += cipher.final('base64')

  const authTag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
}

function createValidAuthHeader() {
  const encryptedToken = encryptToken(TEST_AUTH_TOKEN, TEST_ENCRYPTION_KEY)
  const credentials = Buffer.from(encryptedToken).toString('base64')
  return `Bearer ${credentials}`
}

function createValidLockToken({ sbi, grantCode, grantVersion, sub }) {
  return jwt.sign({ sub, sbi, grantCode, grantVersion, typ: 'lock' }, APPLICATION_LOCK_TOKEN_SECRET, {
    issuer: 'grants-ui',
    audience: 'grants-backend'
  })
}

describe('Provider contract: grants-ui-backend', () => {
  let server

  beforeAll(async () => {
    process.env.GRANTS_UI_BACKEND_AUTH_TOKEN = TEST_AUTH_TOKEN
    process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
    process.env.APPLICATION_LOCK_TOKEN_SECRET = APPLICATION_LOCK_TOKEN_SECRET

    const { createServer } = await import('../src/server.js')
    server = await createServer()
    await server.start()
  })

  afterAll(async () => {
    await server.stop()
  })

  it('validates the pact with grants-ui', async () => {
    const verifier = new Verifier({
      provider: 'grants-ui-backend',
      providerBaseUrl: `http://localhost:${server.info.port}`,
      ...(process.env.PACT_BROKER_BASE_URL
        ? { pactBrokerUrl: process.env.PACT_BROKER_BASE_URL }
        : { pactUrls: [path.resolve(__dirname, './pacts/grants-ui-grants-ui-backend.json')] }),
      requestFilter: (req, res, next) => {
        // Replace the consumer's placeholder tokens with valid ones the server can verify
        req.headers['authorization'] = createValidAuthHeader()
        req.headers['x-application-lock-owner'] = createValidLockToken({
          sub: 'contract-test-user',
          sbi: '123456789',
          grantCode: 'example-grant-with-auth',
          grantVersion: 1
        })

        next()
      },
      stateHandlers: {
        'a submission for a grant application': async () => {
          // Seed the application lock so enforceApplicationLock can acquire/refresh it
          await server.db.collection('grant-application-locks').deleteMany({
            sbi: '123456789',
            grantCode: 'example-grant-with-auth'
          })
          await server.db.collection('grant-application-locks').insertOne({
            sbi: '123456789',
            grantCode: 'example-grant-with-auth',
            grantVersion: 1,
            ownerId: 'contract-test-user',
            lockedAt: new Date(),
            expiresAt: new Date(Date.now() + 60_000)
          })
        }
      },
      publishVerificationResult: process.env.PACT_PUBLISH_VERIFICATION === 'true',
      providerVersion: process.env.SERVICE_VERSION ?? '1.0.0',
      failIfNoPactsFound: false,
      logLevel: 'warn'
    })

    await verifier.verifyProvider()
  }, 60_000)
})
