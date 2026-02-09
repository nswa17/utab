<template>
  <ResultsEditor
    :tournament-id="tournamentId"
    :title="$t('公開結果管理')"
    :show-create="true"
    :editable="true"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ResultsEditor from '@/components/results/ResultsEditor.vue'

const route = useRoute()
useI18n({ useScope: 'global' })
const tournamentId = computed(() => route.params.tournamentId as string)
</script>
