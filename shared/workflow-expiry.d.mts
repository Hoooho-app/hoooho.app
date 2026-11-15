export function beijingDate(at: Date): string
export function isExpiryDate(value: unknown): value is string
export function expiryCountdown(date: string | null, exactAt: string | null, now: Date, renewal?: boolean): {
  label: string; tone: 'unknown' | 'expired' | 'urgent' | 'soon' | 'normal'
}
