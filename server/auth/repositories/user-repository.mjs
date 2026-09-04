import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { JsonStore } from '../storage/json-store.mjs'

export class UserRepository {
  #store

  constructor(dataDirectory) {
    this.#store = new JsonStore(path.join(dataDirectory, 'users.json'), { users: [] })
  }

  async findOrCreateByPhone(phone, now = new Date()) {
    let selectedUser
    await this.#store.update((data) => {
      selectedUser = data.users.find((user) => user.phone === phone)
      if (selectedUser) return data
      selectedUser = { id: randomUUID(), phone, createdAt: now.toISOString() }
      return { ...data, users: [...data.users, selectedUser] }
    })
    return selectedUser
  }

  async findOrCreateByEmail(email, now = new Date()) {
    let selectedUser
    await this.#store.update((data) => {
      selectedUser = data.users.find((user) => user.email === email)
      if (selectedUser) return data
      selectedUser = { id: randomUUID(), email, createdAt: now.toISOString() }
      return { ...data, users: [...data.users, selectedUser] }
    })
    return selectedUser
  }

  async findById(id) {
    const data = await this.#store.read()
    return data.users.find((user) => user.id === id) ?? null
  }

  async findByPhone(phone) {
    const data = await this.#store.read()
    return data.users.find((user) => user.phone === phone) ?? null
  }

  async findByEmail(email) {
    const data = await this.#store.read()
    return data.users.find((user) => user.email === email) ?? null
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
