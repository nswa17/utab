<template>
  <section class="stack">
    <div class="row">
      <h2>{{ $t('管理ダッシュボード') }}</h2>
      <ReloadButton
        @click="refresh"
        :disabled="tournament.loading || styles.loading"
        :loading="tournament.loading || styles.loading"
      />
    </div>
    <div class="card stack">
      <h3 class="section-title">{{ $t('新規大会作成') }}</h3>
      <form class="stack" @submit.prevent="handleCreate">
        <Field :label="$t('大会名')" required v-slot="{ id, describedBy }">
          <input v-model="form.name" :id="id" :aria-describedby="describedBy" type="text" />
        </Field>
        <Field :label="$t('スタイル')" v-slot="{ id, describedBy }">
          <select v-model.number="form.style" :id="id" :aria-describedby="describedBy">
            <option v-for="style in styles.styles" :key="style.id" :value="style.id">
              {{ style.id }}: {{ style.name }}
            </option>
          </select>
        </Field>
        <label class="checkbox-field small">
          <input v-model="form.hidden" type="checkbox" />
          {{ $t('大会を非公開') }}
        </label>
        <Button type="submit" :loading="tournament.loading">{{ $t('作成') }}</Button>
        <p v-if="tournament.error" class="error">{{ tournament.error }}</p>
      </form>
    </div>
    <div class="card stack">
      <h3 class="section-title">{{ $t('登録済み大会') }}</h3>
      <Field :label="$t('検索')" v-slot="{ id, describedBy }">
        <input
          v-model="searchQuery"
          :id="id"
          :aria-describedby="describedBy"
          :placeholder="$t('大会名で検索')"
        />
      </Field>
      <LoadingState v-if="tournament.loading || styles.loading" />
      <p v-else-if="tournament.error" class="error">{{ tournament.error }}</p>
      <EmptyState
        v-else-if="filteredTournaments.length === 0"
        :title="$t('表示できる大会がありません。')"
      />
      <Table v-else hover striped sticky-header>
        <thead>
          <tr>
            <th>{{ $t('大会名') }}</th>
            <th>{{ $t('スタイル') }}</th>
            <th>{{ $t('更新日') }}</th>
            <th>{{ $t('操作') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filteredTournaments" :key="item._id">
            <td>
              <RouterLink class="name-link" :to="`/admin/${item._id}/home`">
                <strong>{{ item.name }}</strong>
                <span v-if="item.user_defined_data?.hidden" class="visibility-badge">
                  {{ $t('非公開') }}
                </span>
              </RouterLink>
            </td>
            <td>{{ styleName(item.style) }}</td>
            <td>{{ formatDate(item.updatedAt ?? item.createdAt) }}</td>
            <td>
              <div class="row">
                <Button variant="secondary" size="sm" :to="`/admin/${item._id}/home`">
                  {{ $t('大会管理') }}
                </Button>
                <Button variant="danger" size="sm" @click="remove(item._id)">{{ $t('削除') }}</Button>
              </div>
            </td>
          </tr>
        </tbody>
      </Table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTournamentStore } from '@/stores/tournament'
import { useAuthStore } from '@/stores/auth'
import { useStylesStore } from '@/stores/styles'
import LoadingState from '@/components/common/LoadingState.vue'
import Button from '@/components/common/Button.vue'
import Field from '@/components/common/Field.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import Table from '@/components/common/Table.vue'
import ReloadButton from '@/components/common/ReloadButton.vue'

const tournament = useTournamentStore()
const styles = useStylesStore()
const auth = useAuthStore()
const { t } = useI18n({ useScope: 'global' })

const visibleTournaments = computed(() => {
  if (auth.role === 'superuser') return tournament.tournaments
  if (auth.role === 'organizer') {
    if (auth.tournaments.length === 0) return []
    return tournament.tournaments.filter((item) => auth.tournaments.includes(item._id))
  }
  return []
})

const searchQuery = ref('')
const naturalSortCollator = new Intl.Collator(['ja', 'en'], {
  numeric: true,
  sensitivity: 'base',
})
const filteredTournaments = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const filtered = q
    ? visibleTournaments.value.filter((item) => {
        return item.name?.toLowerCase().includes(q)
      })
    : visibleTournaments.value
  return filtered.slice().sort((a, b) => {
    const nameCompare = naturalSortCollator.compare(String(a.name ?? ''), String(b.name ?? ''))
    if (nameCompare !== 0) return nameCompare
    return naturalSortCollator.compare(String(a._id ?? ''), String(b._id ?? ''))
  })
})

const form = reactive({
  name: '',
  style: 1,
  hidden: true,
})

onMounted(() => {
  refresh()
})

async function handleCreate() {
  if (!form.name) return
  const created = await tournament.createTournament({
    name: form.name,
    style: form.style,
    options: {},
    user_defined_data: {
      hidden: form.hidden,
    },
  })
  if (created) {
    form.name = ''
    form.style = styles.styles[0]?.id ?? 1
    form.hidden = true
  }
}

function styleName(styleId: number) {
  return styles.styles.find((s) => s.id === styleId)?.name ?? String(styleId)
}

function formatDate(raw?: string) {
  if (!raw) return '—'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

async function refresh() {
  await Promise.all([tournament.fetchTournaments(), styles.fetchStyles()])
  if (!form.style && styles.styles.length > 0) {
    form.style = styles.styles[0].id
  }
}

async function remove(id: string) {
  const ok = window.confirm(t('大会を削除しますか？関連データも削除されます。'))
  if (!ok) return
  await tournament.deleteTournament(id)
}
</script>

<style scoped>
.error {
  color: var(--color-danger);
}

.checkbox-field {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.name-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: inherit;
}

.visibility-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid #fdba74;
  background: #fff7ed;
  color: #9a3412;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  padding: 0.2rem 0.55rem;
}

.section-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 800;
}
</style>
