import crypto from 'node:crypto'

/**
 * Builds the Authorization header value expected by grants-config-broker.
 *
 * The broker expects: `Bearer base64(iv:authTag:encryptedData)` where the
 * encrypted payload is the configured plain token, encrypted with AES-256-GCM
 * using `scryptSync(encryptionKey, 'salt', 32)` as the key.
 *
 * @param {string} plainToken
 * @param {string} encryptionKey
 * @returns {string} Authorization header value
 */
export function buildBrokerBearerHeader(plainToken, encryptionKey) {
  const key = crypto.scryptSync(encryptionKey, 'salt', 32)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  const encrypted = Buffer.concat([cipher.update(plainToken, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  const composite = `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`
  return `Bearer ${Buffer.from(composite, 'utf8').toString('base64')}`
}
