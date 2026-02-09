import 'express-session'

declare module 'express-session' {
  interface TournamentAccessSession {
    grantedAt: number
    expiresAt: number
    version: number
  }

  interface SessionData {
    userId?: string
    usertype?: 'superuser' | 'organizer' | 'adjudicator' | 'speaker' | 'audience'
    tournaments?: string[]
    tournamentAccess?: Record<string, TournamentAccessSession>
  }
}
