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
}
