import { visibleRecordCategories } from '../../shared/record-categories.mjs'
import { projectJournalRecord } from './journal-metadata.mjs'
import { HealthEventService } from './health-event-service.mjs'
import { HealthEventRecordRepository } from './repositories/health-event-record-repository.mjs'
import { EventAttachmentRepository } from './repositories/event-attachment-repository.mjs'

// One scoped request; each store is read once, with no summary generation and
// no original attachment bytes, filesystem keys or media analysis in the index.
export class JournalIndexService {
  constructor(options) {
    this.events = options.events ?? new HealthEventService(options)
    this.records = options.recordRepository ?? new HealthEventRecordRepository(options.dataDirectory)
    this.attachments = options.attachmentRepository ?? new EventAttachmentRepository(options.dataDirectory)
  }
  async list(accountId, memberId, timezone) {
    await this.events.assertMemberOwnership(accountId, memberId)
    const [allEvents, allRecords, allAttachments] = await Promise.all([
      this.events.repository.findByAccountId(accountId),
      this.records.findByAccountId(accountId),
      this.attachments.findIndexByAccountId(accountId)
    ])
    const events = allEvents.filter(event => event.memberId === memberId)
    const ids = new Set(events.map(event => event.id))
    const scopedRecords=allRecords.filter(record => record.accountId === accountId && ids.has(record.eventId))
    const counts=new Map()
    for(const record of scopedRecords)counts.set(record.eventId,(counts.get(record.eventId)??0)+1)
    const records=scopedRecords.map(record=>{
      const projected=projectJournalRecord(record,timezone)
      // A lone original has no sibling occurrence to misattribute. This also
      // makes old feeding records whose generated fields lost a symptom visible.
      if(counts.get(record.eventId)===1)projected.journal.categories=visibleRecordCategories(projected,true)
      return projected
    })
    return { events, records, attachments: allAttachments.filter(file => file.accountId === accountId && ids.has(file.eventId)) }
  }
}
