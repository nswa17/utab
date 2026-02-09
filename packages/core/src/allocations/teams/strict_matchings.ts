import { clone } from 'lodash-es'
import { sillyLogger } from '../../general/loggers.js'
import { shuffle, combinations, isin } from '../../general/math.js'
import { decidePositions, findOne as findOneResult } from '../sys.js'

function addInformationToDivision(
  division: Array<{ win: number; teams: number[] }>,
  config: { style: { team_num: number } }
) {
  const div = division.map((d) => ({ ...d })) as any[]
  const teamNum = config.style.team_num
  div[0].out = 0
  div[0].consider = true
  div[0].in = div[0].teams.length % teamNum === 0 ? 0 : teamNum - (div[0].teams.length % teamNum)

  let nowIn = div[0].in
  for (let i = 1; i < div.length - 1; i++) {
    if (div[i].teams.length < nowIn) {
      div[i].out = div[i].teams.length
      nowIn -= div[i].teams.length
      div[i].consider = false
    } else {
      div[i].out = nowIn
      div[i].consider = true
      const remaining = div[i].teams.length - div[i].out
      nowIn = remaining % teamNum === 0 ? 0 : teamNum - remaining
    }
  }

  div[div.length - 1].out = Math.min(nowIn, div[div.length - 1].teams.length)
  div[div.length - 1].consider = div[div.length - 1].teams.length - div[div.length - 1].out > 0
  return div
}

function pullupFuncFromtop(d: any) {
  return [d.teams.slice(0, d.out), d.teams.slice(d.out)]
}

function pullupFuncFrombottom(d: any) {
  const e = [...d.teams].reverse()
  return [e.slice(0, d.out), e.slice(d.out)]
}

function pullupFuncRandom(d: any, config: { name?: string }) {
  const e = shuffle(d.teams, config.name)
  return [e.slice(0, d.out), e.slice(d.out)]
}

const pullupFuncs: Record<string, Function> = {
  fromtop: pullupFuncFromtop,
  frombottom: pullupFuncFrombottom,
  random: pullupFuncRandom,
}

function divideInto<T>(list: T[], num: number): T[][] {
  const divided: T[][] = []
  const inDiv = list.length / num
  for (let j = 0; j < num; j++) divided.push(list.slice(j * inDiv, (j + 1) * inDiv))
  return divided
}

function divideComb<T>(list: T[], num: number): T[][] {
  if (list.length === num) return [list]
  const heads = combinations(list, num)
  return heads.flatMap((head) =>
    divideComb(
      list.filter((e) => !isin(e, head)),
      num
    ).map((t) => head.concat(t))
  )
}

function pairingFuncSort(teams: any[], config: { style: { team_num: number } }) {
  return divideInto(teams, teams.length / config.style.team_num)
}

function pairingFuncRandom(teams: any[], config: { name?: string; style: { team_num: number } }) {
  const shuffled = shuffle(teams, config.name)
  return pairingFuncSort(shuffled, config)
}

function pairingFuncFold(teams: any[], config: { style: { team_num: number } }) {
  const matched: any[] = []
  const divided = divideInto(teams, config.style.team_num)
  for (let j = config.style.team_num - 1; j >= config.style.team_num / 2; j--) divided[j].reverse()
  for (let i = 0; i < teams.length / config.style.team_num; i++)
    matched.push(divided.map((div) => div[i]))
  return matched
}

function pairingFuncSlide(teams: any[], config: { style: { team_num: number } }) {
  const matched: any[] = []
  const divided = divideInto(teams, config.style.team_num)
  for (let i = 0; i < teams.length / config.style.team_num; i++)
    matched.push(divided.map((div) => div[i]))
  return matched
}

function pairingFuncAdjusted(
  teams: any[],
  config: { name?: string; style: { team_num: number } },
  compiledTeamResults: any[]
) {
  const allCs = divideComb(teams, config.style.team_num)
  const allDivs = allCs.map((c) => divideInto(c, teams.length / config.style.team_num))
  const measures: number[] = []

  for (const divs of allDivs) {
    let measure = 0
    for (const div of divs) {
      const cs = combinations(div, div.length)
      const pastSidesListList = cs.map((c) =>
        c.map((t) => findOneResult(compiledTeamResults, t.id).past_sides)
      )
      if (config.style.team_num === 4) {
        measure += Math.min(
          ...pastSidesListList.map((pastSidesList) =>
            pastSidesList.reduce((acc, curr) => acc + (curr?.length || 0), 0)
          )
        )
      } else if (config.style.team_num === 2) {
        measure += Math.min(
          ...pastSidesListList.map((pastSidesList) =>
            pastSidesList.reduce((acc, curr) => acc + (curr?.length || 0), 0)
          )
        )
      }
    }
    measures.push(measure)
  }
  const maxIndex = measures.indexOf(Math.max(...measures))
  return allDivs[maxIndex]
}

const pairingFuncs: Record<string, Function> = {
  random: pairingFuncRandom,
  fold: pairingFuncFold,
  slide: pairingFuncSlide,
  sort: pairingFuncSort,
  adjusted: pairingFuncAdjusted,
}

const positionFuncs: Record<string, Function> = {
  random: (ts: number[], compiledTeamResults: any[], config: any) => shuffle(ts, config.name),
  adjusted: decidePositions,
}

function match(div: any[], pullupFunc: Function, config: any) {
  sillyLogger(match, arguments, 'draws')
  const divCp = clone(div)
  if (divCp.length === 0) return []
  if (divCp.length === 1) return [divCp[0].teams]

  const matchingPool: number[][] = []
  let matched: number[] = [...divCp[0].teams]

  for (let i = 1; i < divCp.length - 1; i++) {
    if (!divCp[i].consider) continue
    const [chosen, rem] = pullupFunc(divCp[i], config)
    matched = matched.concat(chosen)
    if (rem.length > 0) {
      matchingPool.push([...matched])
      matched = [...rem]
    }
  }

  const last = divCp[divCp.length - 1]
  if (last?.consider) {
    matched = matched.concat(last.teams ?? [])
  }
  if (matched.length > 0) {
    matchingPool.push([...matched])
  }
  return matchingPool
}

function resolveDp(_teams: any[], matching: any[], _compiledTeamResults: any[]) {
  return matching
}

export function strictMatching(
  teams: any[],
  compiledTeamResults: any[],
  config: { name?: string; style: { team_num: number } },
  {
    pairing_method = 'random',
    pullup_method = 'fromtop',
    position_method = 'adjusted',
    avoid_conflict = true,
  } = {}
) {
  sillyLogger(strictMatching, arguments, 'draws')
  if (teams.length === 0) return {}

  const div: any[] = []
  const wins = Array.from(new Set(compiledTeamResults.map((ctr) => ctr.win))) as number[]
  const teamIds = teams.map((t) => t.id)
  wins.sort()

  for (const win of wins) {
    const sameWinTeams = teamIds.filter((id) => findOneResult(compiledTeamResults, id).win === win)
    div.push({ win, teams: sameWinTeams })
  }

  const enrichedDiv = addInformationToDivision(div, config)
  const matchingPool = match(enrichedDiv, pullupFuncs[pullup_method], config)
  const preMatching = matchingPool.flatMap((pool) =>
    pairingFuncs[pairing_method](pool.teams ?? pool, config, compiledTeamResults)
  )
  const matching = preMatching.map((ts: number[]) =>
    positionFuncs[position_method](ts, compiledTeamResults, config)
  )
  const finalMatching = avoid_conflict ? resolveDp(teams, matching, compiledTeamResults) : matching
  return finalMatching
}

export default { strictMatching }
