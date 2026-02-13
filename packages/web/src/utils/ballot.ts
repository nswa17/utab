function hasAnyFiniteScore(scores: number[]) {
  return scores.some((score) => Number.isFinite(score))
}

function sumFiniteScores(scores: number[]) {
  return scores.reduce((total, score) => total + (Number.isFinite(score) ? score : 0), 0)
}

export function hasDecisiveBallotScores(scoresA: number[], scoresB: number[]) {
  if (!hasAnyFiniteScore(scoresA) || !hasAnyFiniteScore(scoresB)) return false
  return sumFiniteScores(scoresA) !== sumFiniteScores(scoresB)
}
