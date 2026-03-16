export type LatestRequestCompletion = {
  isCurrent: boolean
  hasPending: boolean
}

export function createLatestRequestGate() {
  let currentToken = 0
  let pendingCount = 0

  return {
    begin(): number {
      currentToken += 1
      pendingCount += 1
      return currentToken
    },
    isCurrent(token: number): boolean {
      return token === currentToken
    },
    invalidate(): number {
      currentToken += 1
      return currentToken
    },
    complete(token: number): LatestRequestCompletion {
      pendingCount = Math.max(0, pendingCount - 1)
      return {
        isCurrent: token === currentToken,
        hasPending: pendingCount > 0,
      }
    },
  }
}
