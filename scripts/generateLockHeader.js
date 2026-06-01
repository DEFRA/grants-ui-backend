#!/usr/bin/env node
import 'dotenv/config'
import jwt from 'jsonwebtoken'

/**
 * Usage: set these in your .env file:
 *   APPLICATION_LOCK_TOKEN_SECRET=<the same secret as grants-ui-backend>
 *   USER_ID=<DEFRA user ID, e.g., user-1>
 *   SBI=<business identifier>
 *   GRANT_CODE=<grant code>
 *   GRANT_VERSION=<optional, defaults to 1>
 *
 * Then run: node generateLockHeader.js
 */

export function generateLockOwnerToken(secret, userId, sbi, grantCode, grantVersion) {
  return jwt.sign({ sub: userId, sbi, grantCode, grantVersion, typ: 'lock' }, secret, {
    audience: 'grants-backend',
    issuer: 'grants-ui'
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const secret = process.env.APPLICATION_LOCK_TOKEN_SECRET
  const userId = process.env.USER_ID
  const sbi = process.env.SBI
  const grantCode = process.env.GRANT_CODE
  const grantVersion = process.env.GRANT_VERSION

  if (!secret || !userId || !sbi || !grantCode || !grantVersion) {
    console.error('Missing required environment variables!')
    process.exit(1)
  }

  console.log('x-application-lock-owner:', generateLockOwnerToken(secret, userId, sbi, grantCode, grantVersion))
}
