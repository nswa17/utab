# UI QA Checklist

## Accessibility
- Verify focus ring appears on buttons, links, inputs, and select/textarea when navigating with Tab/Shift+Tab.
- Confirm icon-only controls expose meaningful aria-label (e.g., slideshow nav, draggable list arrows).
- Ensure form inputs are associated with visible labels (`for`/`id`) and error text is readable.
- Check language toggle updates locale without layout breakage and preserves focus outline.
- Screen-reader pass: header brand announces site name and destination; navigation indicates current page via aria-current.

## Keyboard Flows
- SlideShow: Left/Right arrows move slides; Esc closes; no trap after closing.
- Admin compiled results: round checkboxes reachable and togglable via keyboard; slide settings toggle operable by Enter/Space.
- Forms: All primary actions are reachable without a mouse; no hidden focus traps in modals/dialogs.

## Visual Regression
- Focus outlines do not clash with backgrounds on light surfaces; borders remain visible on primary/ghost buttons.
- Table/list rows remain aligned after focus/hover; no overflow on narrow viewports for chips/pills.

## Error & Empty States
- EmptyState components render title/message correctly and action slot remains reachable via keyboard.
- Validation errors (where applicable) are announced visually and do not shift layout unexpectedly.

## Smoke Scenarios (Admin)
- Admin Home: search + create tournament flow; focus order follows form top-to-bottom.
- Tournament Home: entity search/paging usable via keyboard; sections collapse/expand without scrolling jumps.
- Rounds: modal edit opens/closes with Esc and respects focus return.
- Submissions: filter/search and JSON collapse expand/collapse via keyboard; chart toggle accessible.
- Compiled results: CSV download button reachable; warning texts readable and contrast-compliant.

## Smoke Scenarios (User)
- Tournament list search/filter accessible; card/table layout remains readable in both languages.
- Participant round pages: back buttons, ballot/feedback forms maintain label associations and keyboard order.

## Localization
- Switch locale and verify charts/slides/buttons re-render labels; dates/numbers follow locale formatting where shown.

Document the run date, browser/device, and any deviations found.
