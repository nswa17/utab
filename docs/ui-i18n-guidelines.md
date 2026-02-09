# UI Translation Guidelines

## Scope
- Applicable to all UI text in `packages/web/src`.
- New user-facing strings must be added to `packages/web/src/i18n/messages.ts`.

## Key and Text Rules
- Use the Japanese source phrase as the key for now (current repository convention).
- Do not hardcode visible text in templates or scripts.
- Always render UI text via `$t('...')`.
- Keep one meaning per key. Do not reuse a key for a different context.

## Naming and Reuse
- Prefer existing keys before adding new ones.
- When adding a new phrase, add the key once and reuse it across screens.
- Keep placeholders explicit (`{name}`, `{round}`, `{count}`) and consistent.

## Locale-dependent Formatting
- Dates: use `new Date(value).toLocaleString()`.
- Numbers: use locale-aware formatting (`toLocaleString`, Highcharts locale labels).
- Ordinal or ranking labels must branch by locale when needed.

## Review Checklist
- No raw UI strings in `.vue` templates (except IDs/classes).
- No missing key warnings in runtime logs.
- Long labels remain readable in both Japanese and English.
- Placeholders are substituted correctly in both languages.
