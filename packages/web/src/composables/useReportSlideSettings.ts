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
    credit: DEFAULT_SLIDE_SETTINGS.credit,
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
  const credit = String(source.credit ?? '').trim()
  return {
    maxRankingRewarded: normalizeSlideMax(source.maxRankingRewarded),
    type: normalizeSlideType(source.type),
    style: normalizeSlideStyle(source.style, legacyStyle ?? DEFAULT_SLIDE_SETTINGS.style),
    credit: credit.length > 0 ? credit : DEFAULT_SLIDE_SETTINGS.credit,
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
        credit:
          typeof patch.credit === 'string' && patch.credit.trim().length > 0
            ? patch.credit.trim()
            : current.credit,
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
