#!/usr/bin/env node
import 'dotenv/config'
import jwt from 'jsonwebtoken'

/**
 * Usage:
 *   APPLICATION_LOCK_TOKEN_SECRET=<same secret as grants-ui-backend>
 *   OWNER_ID=<Defra contactId>
 *
 * Then run:
 *   node generateLockReleaseHeader.js
 */

export function generateLockReleaseToken(secret, ownerId) {
  return jwt.sign({ sub: String(ownerId), typ: 'lock-release' }, secret, {
    audience: 'grants-backend',
    issuer: 'grants-ui'
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const secret = process.env.APPLICATION_LOCK_TOKEN_SECRET
  const ownerId = process.env.OWNER_ID

  if (!secret || !ownerId) {
    console.error('Missing required environment variables!')
    process.exit(1)
  }

  console.log('x-application-lock-release:', generateLockReleaseToken(secret, ownerId))
}
