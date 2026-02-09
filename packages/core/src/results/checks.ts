import { sillyLogger } from '../general/loggers.js'
import { ResultNotSent, WinPointsDifferent } from '../general/errors.js'
import { checkDetail } from '../general/tools.js'

export function speakerResultsPrecheck(rawSpeakerResults: any[], speakers: any[], r: number): void {
  sillyLogger(speakerResultsPrecheck, arguments, 'checks')
  for (const speaker of speakers) {
    const results = rawSpeakerResults.filter((rdr) => rdr.id === speaker.id && rdr.r === r)
    if (results.length === 0) throw new ResultNotSent(speaker.id, 'speaker', r)
  }
}

export function adjudicatorResultsPrecheck(
  rawAdjResults: any[],
  adjudicators: any[],
  r: number
): void {
  sillyLogger(adjudicatorResultsPrecheck, arguments, 'checks')
  for (const adj of adjudicators) {
    const results = rawAdjResults.filter((rar) => rar.id === adj.id && rar.r === r)
    if (results.length === 0) throw new ResultNotSent(adj.id, 'adjudicator', r)
  }
}

export function teamResultsPrecheck(
  rawTeamResults: any[],
  teams: any[],
  r: number,
  teamNum: number
): void {
  sillyLogger(teamResultsPrecheck, arguments, 'checks')
  for (const team of teams) {
    const results = rawTeamResults.filter((rdr) => rdr.id === team.id && rdr.r === r)
    if (results.length === 0) throw new ResultNotSent(team.id, 'team', r)
    if (teamNum === 2) {
      if (results.length % 2 === 0) {
        const wins = results.map((rres) => rres.win)
        if (
          wins.filter((w: number) => w === 1).length === wins.filter((w: number) => w === 0).length
        ) {
          throw new WinPointsDifferent(team.id, wins)
        }
      }
    } else if (teamNum === 4) {
      const wins = results.map((rres) => rres.win)
      if (wins.some((w) => w !== wins[0])) throw new WinPointsDifferent(team.id, wins)
    }
  }
}

export function resultsPrecheck(teams: any[], _speakers: any[], r: number): void {
  sillyLogger(resultsPrecheck, arguments, 'checks')
  checkDetail(teams, r)
}

export default {
  speakerResultsPrecheck,
  adjudicatorResultsPrecheck,
  teamResultsPrecheck,
  resultsPrecheck,
}
