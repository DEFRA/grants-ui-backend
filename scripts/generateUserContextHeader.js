import 'dotenv/config'
import jwt from 'jsonwebtoken'

const secret = process.env.ENCRYPTED_AUTH_JWT_SECRET
const crn = process.env.CRN
const sbi = process.env.SBI

if (!secret || !crn || !sbi) {
  throw new Error('Missing ENCRYPTED_AUTH_JWT_SECRET, CRN or SBI in environment variables')
}

const token = jwt.sign({ crn, sbi }, secret, { expiresIn: '15m' })
console.log('x-user-context: ' + token)
