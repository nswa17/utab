type TranslateFn = (key: string, params?: Record<string, unknown>) => string

type ResolveReloadButtonAttrsInput = {
  attrs?: Record<string, unknown>
  target?: string
  labelText: string
  t: TranslateFn
}

export function resolveReloadButtonLabel(label: string | undefined, t: TranslateFn): string {
  const resolved = String(label ?? '').trim()
  return resolved || t('再読み込み')
}

export function resolveReloadButtonAttrs({
  attrs = {},
  target,
  labelText,
  t,
}: ResolveReloadButtonAttrsInput): Record<string, unknown> {
  const resolvedTarget = String(target ?? '').trim()
  const fallbackAriaLabel = resolvedTarget
    ? t('{target}を再読み込み', { target: resolvedTarget })
    : labelText
  const ariaLabel = String(attrs['aria-label'] ?? '').trim() || fallbackAriaLabel
  const title = String(attrs.title ?? '').trim() || ariaLabel
  return {
    ...attrs,
    'aria-label': ariaLabel,
    title,
  }
}
