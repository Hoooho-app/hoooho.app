export class HealthEventRecordError extends Error {
  constructor(message, status = 400, code = 'HEALTH_EVENT_RECORD_ERROR') {
    super(message)
    this.status = status
    this.code = code
  }
}
