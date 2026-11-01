export interface AnalyticsReport {
  generatedAt: string; startedAt: string; retentionDays: number; connected: boolean; start: string; end: string; versions: string[]
  collection: { lastAt: string | null; controls: number; status: 'awaiting' | 'quiet' | 'receiving' }
  overview: { visitors: number; newVisitors: number; sessions: number; views: number; completed: number; zeroPages: number }
  pages: Array<{ id: string; name: string; available: boolean; visitors: number; views: number; seconds: number; averageSeconds: number; clicks: number; exits: number; status: string }>
  features: Array<{ id: string; page: string; surface?: string; name: string; exposures: number; exposedUsers: number; clicks: number; clickUsers: number; average: number; started: number; completed: number; failed: number; cancelled: number; users: number; type: string }>
  trend: Array<{ day: string; visitors: number; views: number }>
  paths: Array<{ from: string; to: string; count: number; actors: number }>
  sessions: Array<{ id: string; at: string; pages: Array<{ page: string; at: string }> }>
  funnels: Array<{ name: string; steps: Array<{ name: string; users: number; rate: number | null }> }>
  retention: Array<{ days: number; eligible: number; returned: number; rate: number | null }>
}
