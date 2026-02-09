import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface BallotEntry {
  teamId: string
  scores: number[]
}

export const useBallotStore = defineStore('ballot', () => {
  const entries = ref<BallotEntry[]>([])

  function setEntries(next: BallotEntry[]) {
    entries.value = next
  }

  function clear() {
    entries.value = []
  }

  return { entries, setEntries, clear }
})
