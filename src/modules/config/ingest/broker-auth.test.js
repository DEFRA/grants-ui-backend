import crypto from 'node:crypto'
import { buildBrokerBearerHeader } from './broker-auth.js'

const decryptHeader = (header, encryptionKey) => {
  const composite = Buffer.from(header.replace(/^Bearer /, ''), 'base64').toString('utf8')
  const [ivB64, authTagB64, encryptedB64] = composite.split(':')

  const key = crypto.scryptSync(encryptionKey, 'salt', 32)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'))

  return Buffer.concat([decipher.update(Buffer.from(encryptedB64, 'base64')), decipher.final()]).toString('utf8')
}

describe('buildBrokerBearerHeader', () => {
  const TOKEN = 'super-secret-token'
  const KEY = 'encryption-key'

  test('produces a Bearer header', () => {
    const header = buildBrokerBearerHeader(TOKEN, KEY)

    expect(header.startsWith('Bearer ')).toBe(true)
  })

  test('encrypts the token so it can be decrypted with the same key (round-trip)', () => {
    const header = buildBrokerBearerHeader(TOKEN, KEY)

    expect(decryptHeader(header, KEY)).toBe(TOKEN)
  })

  test('uses a fresh random IV so repeated calls differ', () => {
    const first = buildBrokerBearerHeader(TOKEN, KEY)
    const second = buildBrokerBearerHeader(TOKEN, KEY)

    expect(first).not.toBe(second)
    expect(decryptHeader(first, KEY)).toBe(TOKEN)
    expect(decryptHeader(second, KEY)).toBe(TOKEN)
  })

  test('cannot be decrypted with a different key', () => {
    const header = buildBrokerBearerHeader(TOKEN, KEY)

    expect(() => decryptHeader(header, 'wrong-key')).toThrow()
  })
})
