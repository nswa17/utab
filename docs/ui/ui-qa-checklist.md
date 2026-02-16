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
- Tournament Home: `新規ラウンド作成`（番号/名称/種別）から追加でき、追加後にラウンド一覧へ即時反映される。
- Rounds: modal edit opens/closes with Esc and respects focus return.
- Rounds: 作成UIは表示されず、`大会セットアップ` への導線と既存ラウンドの上書き編集に集中している。
- Submissions: filter/search and JSON collapse expand/collapse via keyboard; chart toggle accessible.
- Compiled results: CSV download button reachable; warning texts readable and contrast-compliant.
- Compiled results (UX v3): 上段は `既存レポートの選択` / `新規レポート生成` / `提出状況サマリー` の3枠に分かれ、提出状況テーブル行から `提出状況` タブへ遷移できる。
- Compiled results (UX v3): `entityごとの順位一覧 / 公平性 / 発表準備` の3タブが切り替わり、既定タブが `entityごとの順位一覧` である。
- Compiled results (UX v3): `entityごとの順位一覧` で `集計区分` の小枠セグメントが表示され、選択中区分の順位テーブルが直下に表示される。
- Compiled results (UX v3): 差分比較セレクトの候補ラベルが `Round 1, Round 2 (月/日 時刻)` 形式で表示され、既定値が一個前の集計になっている。
- Compiled results (UX v3): `発表準備サマリ` と `発表境界` が表示されず、発表準備はスライド/表彰出力に集中している。
- Compiled results (UX v3): `分析` は独立タブではなく `公平性` タブ内（分析統合セクション）で表示される。
- Compiled results (UX v3): `提出スピード` カードに `正常/注意/要介入` の状態と `中央値/P90/遅延率` が表示される。
- Compiled results (UX v3): `ジャッジ偏差 (Strictness)` は z-score 数値と0中心の偏差バーが一致し、厳しめ/甘めの判定が視覚的に読める。
- Compiled results (UX v3): `分析` タブは初回表示時のみ遅延描画し、データ不足時は `EmptyState` が出る。

## Compile Regression (Phase 4)
- Compiled results: 表示スナップショットを切り替えたとき、一覧/差分/CSVの対象が同じsnapshotに揃う。
- Compiled results: `詳細再計算` は初期状態で閉じており、開閉後も表示中snapshotは保持される。
- Compiled results: `source=raw` 選択時に `提出データ一本化ガイド` が表示され、`提出一覧` / `ラウンド運営` へ遷移できる。
- Admin routing: `admin UI v2` フラグ ON/OFF で初期遷移先（`/setup` vs `/home`）が切り替わる。
- Admin routing: `VITE_ADMIN_UI_LEGACY_READONLY=true` で `/home` `/rounds` `/compiled` が読み取り専用表示になり、`新画面へ移動` が表示される。
- Admin routing: legacy read-only 時は移行導線が1箇所にまとまり、通常の `新画面へ移動` 行と重複表示しない。
- Compile with options omitted (legacy request) and confirm ranking/output matches pre-Phase3 expectation.
- Confirm compile options summary does not alter payload when untouched (default-compatible behavior).
- CSV export smoke: header/row order remains stable for `teams/speakers/adjudicators/poi/best`.
- Public `compiled` API response does not include internal compile fields (`compile_options`, `compile_warnings`, `compile_diff_meta`).
- Diff indicators are understandable without color only (icon + text/tooltip meaning is present).
- Submission summary in compiled screen matches submissions page counts (submitted/missing/duplicates/unknown).
- Duplicate normalization smoke:
  - Different adjudicators on the same matchup are not merged as duplicates.
  - Same adjudicator duplicate ballots are merged according to `merge_policy` (`latest` / `average` / `error`).
- Ranking tie smoke:
  - Custom `ranking_priority` で全指標同値の場合、同順位が維持される。
- Ballot validation smoke:
  - `allow_low_tie_win=true` で非同点スコア時は勝者未選択の送信がブロックされる。
  - `no_speaker_score=true` のラウンドで送信不能にならない。

## Telemetry Regression
- ブラウザで `window.addEventListener('utab:admin-report-metric', handler)` を設定し、レポート操作時にイベントが流れることを確認する。
- タブ切替で `metric=tab_leave` に `dwellMs` が含まれ、直後に `metric=tab_enter` が同一操作で発火する。
- `再計算`・CSV出力・表彰コピーで `metric=cta_click` が発火し、完了後に `metric=export_complete` が発火する。

## Smoke Scenarios (User)
- Tournament list search/filter accessible; card/table layout remains readable in both languages.
- Participant round pages: back buttons, ballot/feedback forms maintain label associations and keyboard order.

## Localization
- Switch locale and verify charts/slides/buttons re-render labels; dates/numbers follow locale formatting where shown.

Document the run date, browser/device, and any deviations found.
