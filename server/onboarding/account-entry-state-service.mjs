import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'

export class AccountEntryStateService {
  constructor(options = {}) {
    this.members = options.members ?? new FamilyMemberRepository(options.dataDirectory)
    this.records = options.records ?? new HealthEventRecordRepository(options.dataDirectory)
  }

  async get(accountId) {
    const [members, records] = await Promise.all([
      this.members.findByAccountId(accountId),
      this.records.findByAccountId(accountId)
    ])

    return {
      familyMemberCount: members.length,
      hasValidHealthRecord: records.some((record) => (
        typeof record.content === 'string'
        && record.content.trim().length > 0
      ))
    }
  }
}
