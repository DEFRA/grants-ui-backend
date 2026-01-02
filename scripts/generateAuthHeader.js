import 'dotenv/config'

import crypto from 'crypto'

const token = process.env.GRANTS_UI_BACKEND_AUTH_TOKEN
const encryptionKey = process.env.GRANTS_UI_BACKEND_ENCRYPTION_KEY

if (!token || !encryptionKey) {
  throw new Error('Missing auth token or encryption key in environment variables')
}

const key = crypto.scryptSync(encryptionKey, 'salt', 32)
const iv = crypto.randomBytes(16)
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

let encrypted = cipher.update(token, 'utf8', 'base64')
encrypted += cipher.final('base64')

const authTag = cipher.getAuthTag().toString('base64')
const ivB64 = iv.toString('base64')

const encryptedToken = `${ivB64}:${authTag}:${encrypted}`
const header = Buffer.from(encryptedToken).toString('base64')

console.log('Authorization: Bearer ' + header)
