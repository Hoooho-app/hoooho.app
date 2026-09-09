import path from 'node:path'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { JsonStore } from '../storage/json-store.mjs'

export class UserRepository {
  #store

  constructor(dataDirectory) {
    this.#store = new JsonStore(path.join(dataDirectory, 'users.json'), { users: [] })
  }

  async findOrCreateByPhone(phone, now = new Date()) {
    let selectedUser
    await this.#store.update((data) => {
      const existing = data.users.find((user) => user.phone === phone)
      if (existing) {
        selectedUser = existing.hooohoId ? existing : { ...existing, hooohoId: createHooohoId(data.users), updatedAt: now.toISOString() }
        return existing === selectedUser ? data : { ...data, users: data.users.map((user) => user.id === existing.id ? selectedUser : user) }
      }
      selectedUser = { id: randomUUID(), hooohoId: createHooohoId(data.users), phone, createdAt: now.toISOString() }
      return { ...data, users: [...data.users, selectedUser] }
    })
    return selectedUser
  }

  async findOrCreateByEmail(email, now = new Date()) {
    let selectedUser
    await this.#store.update((data) => {
      const existing = data.users.find((user) => user.email === email)
      if (existing) {
        selectedUser = existing.hooohoId ? existing : { ...existing, hooohoId: createHooohoId(data.users), updatedAt: now.toISOString() }
        return existing === selectedUser ? data : { ...data, users: data.users.map((user) => user.id === existing.id ? selectedUser : user) }
      }
      selectedUser = { id: randomUUID(), hooohoId: createHooohoId(data.users), email, createdAt: now.toISOString() }
      return { ...data, users: [...data.users, selectedUser] }
    })
    return selectedUser
  }

  async findById(id) {
    const data = await this.#store.read()
    return data.users.find((user) => user.id === id) ?? null
  }

  async createGuest(id = `guest:${randomUUID()}`, now = new Date()) {
    let user
    await this.#store.update((data) => {
      user = data.users.find((item) => item.id === id)
      if (user) return data
      user = { id, guest: true, createdAt: now.toISOString() }
      return { ...data, users: [...data.users, user] }
    })
    return user
  }

  async findByPhone(phone) {
    const data = await this.#store.read()
    return data.users.find((user) => user.phone === phone) ?? null
  }

  async findByEmail(email) {
    const data = await this.#store.read()
    return data.users.find((user) => user.email === email) ?? null
  }

  async findByHooohoId(hooohoId) {
    const data = await this.#store.read()
    return data.users.find((user) => user.hooohoId === hooohoId) ?? null
  }

  async ensureHooohoId(id, now = new Date()) {
    let selectedUser = null
    await this.#store.update((data) => {
      const existing = data.users.find((user) => user.id === id)
      if (!existing) return data
      if (existing.hooohoId || existing.guest) { selectedUser = existing; return data }
      selectedUser = { ...existing, hooohoId: createHooohoId(data.users), updatedAt: now.toISOString() }
      return { ...data, users: data.users.map((user) => user.id === id ? selectedUser : user) }
    })
    return selectedUser
  }

  async register({ nickname, passwordHash, registrationKeyHash, guestId = null }, now = new Date()) {
    let selectedUser
    await this.#store.update((data) => {
      const replay = data.users.find((user) => user.registrationKeyHash === registrationKeyHash)
      if (replay) { selectedUser = replay; return data }
      const guest = guestId ? data.users.find((user) => user.id === guestId && user.guest && !user.mergedInto) : null
      selectedUser = guest
        ? { ...guest, guest: false, nickname, passwordHash, hooohoId: createHooohoId(data.users), registrationKeyHash, upgradedAt: now.toISOString(), updatedAt: now.toISOString() }
        : { id: randomUUID(), nickname, passwordHash, hooohoId: createHooohoId(data.users), registrationKeyHash, createdAt: now.toISOString() }
      return { ...data, users: guest ? data.users.map((user) => user.id === guest.id ? selectedUser : user) : [...data.users, selectedUser] }
    })
    return selectedUser
  }

  async update(id, changes, now = new Date()) {
    let updated = null
    await this.#store.update((data) => ({
      ...data,
      users: data.users.map((user) => {
        if (user.id !== id) return user
        updated = { ...user, ...changes, id: user.id, createdAt: user.createdAt, updatedAt: now.toISOString() }
        return updated
      })
    }))
    return updated
  }

  async delete(id) {
    let deleted = null
    await this.#store.update((data) => ({
      ...data,
      users: data.users.filter((user) => {
        if (user.id !== id) return true
        deleted = user
        return false
      })
    }))
    return deleted
  }
}

const hooohoAlphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
function createHooohoId(users) {
  const used = new Set(users.map((user) => user.hooohoId).filter(Boolean))
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const bytes = randomBytes(7)
    const value = `H${Array.from(bytes, (byte) => hooohoAlphabet[byte % hooohoAlphabet.length]).join('')}`
    if (!used.has(value)) return value
  }
  throw new Error('Unable to allocate a unique Hoooho ID')
}

export const hashRegistrationKey = (value) => createHash('sha256').update(value).digest('hex')
