import { computed, ref, watch, type Ref } from 'vue'
import {
  DEFAULT_SLIDE_SETTINGS,
  normalizeSlideLabel,
  normalizeSlideMax,
  normalizeSlideStyle,
  normalizeSlideType,
  type SlideLabel,
  type SlideSettings,
} from '@/utils/slides-presentation'

type PersistedSlideSettings = {
  version: 1
  lastLabel: SlideLabel
  settings: Record<SlideLabel, SlideSettings>
}

const ALL_LABELS: SlideLabel[] = ['teams', 'speakers', 'adjudicators', 'poi', 'best']

function cloneDefaultSettings(): SlideSettings {
  return {
    maxRankingRewarded: DEFAULT_SLIDE_SETTINGS.maxRankingRewarded,
    type: DEFAULT_SLIDE_SETTINGS.type,
    style: DEFAULT_SLIDE_SETTINGS.style,
    leftCredit: DEFAULT_SLIDE_SETTINGS.leftCredit,
    rightCredit: DEFAULT_SLIDE_SETTINGS.rightCredit,
  }
}

function defaultSettingsByLabel(): Record<SlideLabel, SlideSettings> {
  return {
    teams: cloneDefaultSettings(),
    speakers: cloneDefaultSettings(),
    adjudicators: cloneDefaultSettings(),
    poi: cloneDefaultSettings(),
    best: cloneDefaultSettings(),
  }
}

function normalizeSettings(value: unknown): SlideSettings {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const rawType = String(source.type ?? '').trim()
  const legacyStyle = rawType === 'simple' ? 'simple' : rawType === 'pretty' ? 'pretty' : undefined
  const legacyCredit = String(source.credit ?? '').trim()
  const leftCredit = String(source.leftCredit ?? '').trim()
  const rightCredit = String(source.rightCredit ?? '').trim()
  return {
    maxRankingRewarded: normalizeSlideMax(source.maxRankingRewarded),
    type: normalizeSlideType(source.type),
    style: normalizeSlideStyle(source.style, legacyStyle ?? DEFAULT_SLIDE_SETTINGS.style),
    leftCredit:
      leftCredit.length > 0
        ? leftCredit
        : legacyCredit.length > 0
          ? legacyCredit
          : DEFAULT_SLIDE_SETTINGS.leftCredit,
    rightCredit: rightCredit.length > 0 ? rightCredit : DEFAULT_SLIDE_SETTINGS.rightCredit,
  }
}

function parseStoredSettings(raw: string | null): PersistedSlideSettings {
  const defaults: PersistedSlideSettings = {
    version: 1,
    lastLabel: 'teams',
    settings: defaultSettingsByLabel(),
  }
  if (!raw) return defaults

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (Number(parsed.version) !== 1) return defaults

    const settingsSource =
      parsed.settings && typeof parsed.settings === 'object'
        ? (parsed.settings as Record<string, unknown>)
        : {}

    const settings = defaultSettingsByLabel()
    ALL_LABELS.forEach((label) => {
      settings[label] = normalizeSettings(settingsSource[label])
    })

    return {
      version: 1,
      lastLabel: normalizeSlideLabel(parsed.lastLabel, 'teams'),
      settings,
    }
  } catch {
    return defaults
  }
}

export function useReportSlideSettings(tournamentId: Ref<string>) {
  const slideLabel = ref<SlideLabel>('teams')
  const settingsByLabel = ref<Record<SlideLabel, SlideSettings>>(defaultSettingsByLabel())

  const storageKey = computed(() => {
    const id = String(tournamentId.value ?? '').trim()
    if (!id) return ''
    return `utab:reports:slides:v1:${id}`
  })

  function loadFromStorage() {
    if (!storageKey.value) {
      slideLabel.value = 'teams'
      settingsByLabel.value = defaultSettingsByLabel()
      return
    }
    const parsed = parseStoredSettings(localStorage.getItem(storageKey.value))
    slideLabel.value = parsed.lastLabel
    settingsByLabel.value = parsed.settings
  }

  function persistToStorage() {
    if (!storageKey.value) return
    const payload: PersistedSlideSettings = {
      version: 1,
      lastLabel: slideLabel.value,
      settings: settingsByLabel.value,
    }
    localStorage.setItem(storageKey.value, JSON.stringify(payload))
  }

  function setSlideLabel(label: SlideLabel) {
    slideLabel.value = normalizeSlideLabel(label, slideLabel.value)
  }

  function updateSlideSettings(label: SlideLabel, patch: Partial<SlideSettings>) {
    const normalizedLabel = normalizeSlideLabel(label, 'teams')
    const current = settingsByLabel.value[normalizedLabel] ?? cloneDefaultSettings()
    settingsByLabel.value = {
      ...settingsByLabel.value,
      [normalizedLabel]: {
        maxRankingRewarded: normalizeSlideMax(
          patch.maxRankingRewarded,
          current.maxRankingRewarded
        ),
        type: normalizeSlideType(patch.type, current.type),
        style: normalizeSlideStyle(patch.style, current.style),
        leftCredit:
          typeof patch.leftCredit === 'string' ? patch.leftCredit.trim() : current.leftCredit,
        rightCredit:
          typeof patch.rightCredit === 'string' ? patch.rightCredit.trim() : current.rightCredit,
      },
    }
  }

  const currentSlideSettings = computed(() => settingsByLabel.value[slideLabel.value])

  watch(storageKey, loadFromStorage, { immediate: true })

  watch(
    [slideLabel, settingsByLabel, storageKey],
    () => {
      persistToStorage()
    },
    { deep: true }
  )

  return {
    slideLabel,
    settingsByLabel,
    currentSlideSettings,
    setSlideLabel,
    updateSlideSettings,
  }
}
