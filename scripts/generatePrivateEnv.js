#!/usr/bin/env node

/**
 * Generates JWT tokens for the local dev environment and writes them into
 * http/http-client.private.env.json (local section only).
 *
 * Variables are sourced from:
 *   - http/grants-ui-backend.http  (grantCode, grantVersion, sbi, userId)
 *   - compose.yml                  (APPLICATION_LOCK_TOKEN_SECRET,
 *                                   GRANTS_UI_BACKEND_AUTH_TOKEN,
 *                                   GRANTS_UI_BACKEND_ENCRYPTION_KEY)
 *
 * No .env file required.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateAuthToken } from './generateAuthHeader.js'
import { generateLockOwnerToken } from './generateLockHeader.js'
import { generateLockReleaseToken } from './generateLockReleaseHeader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// 1. Parse variables from grants-ui-backend.http
// ---------------------------------------------------------------------------
const httpFile = readFileSync(resolve(root, 'http/grants-ui-backend.http'), 'utf8')

function parseHttpVar(name) {
  const match = httpFile.match(new RegExp(`^@${name}\\s*=\\s*(.+)$`, 'm'))
  if (!match) throw new Error(`Could not find @${name} in grants-ui-backend.http`)
  return match[1].trim()
}

const grantCode = parseHttpVar('grantCode')
const grantVersion = parseHttpVar('grantVersion')
const sbi = parseHttpVar('sbi')
const userId = parseHttpVar('userId')

// ---------------------------------------------------------------------------
// 2. Parse environment variables from compose.yml
// ---------------------------------------------------------------------------
const composeFile = readFileSync(resolve(root, 'compose.yml'), 'utf8')

function parseComposeEnv(name) {
  const match = composeFile.match(new RegExp(`^\\s+${name}:\\s*(.+)$`, 'm'))
  if (!match) throw new Error(`Could not find ${name} in compose.yml`)
  // Strip inline shell default syntax like ${VAR:-default} → return the default
  const raw = match[1].trim().replace(/^['"]|['"]$/g, '')
  const defaultMatch = raw.match(/^\$\{[^}]+:-(.+)\}$/)
  return defaultMatch ? defaultMatch[1] : raw
}

const lockSecret = parseComposeEnv('APPLICATION_LOCK_TOKEN_SECRET')
const authToken = parseComposeEnv('GRANTS_UI_BACKEND_AUTH_TOKEN')
const encryptionKey = parseComposeEnv('GRANTS_UI_BACKEND_ENCRYPTION_KEY')
const configBrokerAuthToken = parseComposeEnv('GRANTS_CONFIG_BROKER_AUTH_TOKEN')
const configBrokerEncryptionKey = parseComposeEnv('GRANTS_CONFIG_BROKER_ENCRYPTION_KEY')

// ---------------------------------------------------------------------------
// 3. Generate tokens via the shared script functions
// ---------------------------------------------------------------------------
const backendAuthToken = generateAuthToken(authToken, encryptionKey)
const applicationLockOwnerToken = generateLockOwnerToken(lockSecret, userId, sbi, grantCode, grantVersion)
const applicationLockReleaseToken = generateLockReleaseToken(lockSecret, userId)

// ---------------------------------------------------------------------------
// 4. Write results into the local section of http-client.private.env.json
// ---------------------------------------------------------------------------
const privateEnvPath = resolve(root, 'http/http-client.private.env.json')

let privateEnv = {}
try {
  const raw = readFileSync(privateEnvPath, 'utf8').trim()
  privateEnv = raw ? JSON.parse(raw) : {}
} catch {
  // File does not exist or is not valid JSON — start fresh
}

if (!privateEnv.local) privateEnv.local = {}

privateEnv.local.backendAuthToken = backendAuthToken
privateEnv.local.applicationLockOwnerToken = applicationLockOwnerToken
privateEnv.local.applicationLockReleaseToken = applicationLockReleaseToken

if (!privateEnv.local.configBrokerAuthToken) {
  privateEnv.local.configBrokerAuthToken = configBrokerAuthToken
}
if (!privateEnv.local.configBrokerEncryptionKey) {
  privateEnv.local.configBrokerEncryptionKey = configBrokerEncryptionKey
}

if (!('xApiKey' in privateEnv.local)) {
  privateEnv.local.xApiKey = ''
}

writeFileSync(privateEnvPath, JSON.stringify(privateEnv, null, 2) + '\n')

console.log('✓ http/http-client.private.env.json (local) updated:')
console.log('  backendAuthToken')
console.log('  applicationLockOwnerToken')
console.log('  applicationLockReleaseToken')
console.log('  configBrokerAuthToken (if absent)')
console.log('  configBrokerEncryptionKey (if absent)')
console.log('  xApiKey (if absent)')
