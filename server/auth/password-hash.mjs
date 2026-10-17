import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'

// bcrypt only consumes the first 72 UTF-8 bytes. Encode the full password in a
// versioned, fixed-width input so the existing 6–64 character contract is safe
// for every supported Unicode password, without changing old stored hashes.
const version = 'hoooho-sha256-bcrypt-v1:'
const encode = password => createHash('sha256').update('Hoooho password v1\0', 'utf8').update(password, 'utf8').digest('hex')

export function validPasswordInput(value) {
  return typeof value === 'string' && value.length >= 6 && value.length <= 64 && value.isWellFormed()
}

export async function hashPassword(password) {
  return version + await bcrypt.hash(encode(password), 12)
}

export async function verifyPassword(password, hash) {
  if (!validPasswordInput(password) || typeof hash !== 'string') return false
  if (hash.startsWith(version)) return bcrypt.compare(encode(password), hash.slice(version.length))
  // An old hash cannot tell an original >=72-byte password from its 72-byte
  // prefix. Neither may authenticate. The bound-email verification flow can
  // reset these credentials without guessing or silently migrating a prefix.
  if (!/^\$2[aby]\$/.test(hash) || Buffer.byteLength(password, 'utf8') >= 72) return false
  return bcrypt.compare(password, hash)
}
