import { healthProfiles } from '../mock/healthProfiles'
import { members } from '../mock/members'

const wait = (duration = 120) => new Promise((resolve) => window.setTimeout(resolve, duration))

export const mockService = {
  async getMembers() { await wait(); return members },
  async getProfiles() { await wait(); return healthProfiles }
}
