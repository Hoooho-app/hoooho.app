import path from 'node:path'
import { JsonStore } from '../storage/json-store.mjs'

export class VerificationCodeRepository {
  #store

  constructor(dataDirectory) {
    this.#store = new JsonStore(path.join(dataDirectory, 'verification-codes.json'), { codes: [] })
  }

  async findByPhone(phone) {
    const data = await this.#store.read()
    return data.codes.find((entry) => entry.phone === phone) ?? null
  }

  async save(entry) {
    await this.#store.update((data) => ({
      ...data,
      codes: [...data.codes.filter((item) => item.phone !== entry.phone), entry]
    }))
  }

  async consume(phone) {
    await this.#store.update((data) => ({
      ...data,
      codes: data.codes.filter((entry) => entry.phone !== phone)
    }))
  }
}
