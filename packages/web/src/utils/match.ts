export function makeMatchKey(teamAId: string, teamBId: string): string {
  if (!teamAId || !teamBId) return ''
  const [first, second] = [teamAId, teamBId].sort()
  return `${first}::${second}`
}
