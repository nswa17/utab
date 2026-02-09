<template>
  <ResultsEditor
    :tournament-id="tournamentId"
    title="Results"
    :show-create="false"
    :editable="false"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ResultsEditor from '@/components/results/ResultsEditor.vue'

const route = useRoute()
const tournamentId = computed(() => route.params.tournamentId as string)
</script>
