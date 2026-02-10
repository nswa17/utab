# UI Issues (UTab)

## 問題点一覧（分類 + 優先度）
| 優先度 | 分類 | 場所 | 症状/影響 |
| --- | --- | --- | --- |
| P0 | 一貫性/保守性 | `packages/web/src/views/admin/AdminHome.vue` | `</style>` の後にスクリプト断片が残っており、SFC として解釈できない可能性。UI 改修以前にビルド阻害リスク。 |
| P1 | 操作性 | `packages/web/src/views/admin/AdminTournamentHome.vue` | エンティティ管理が 1 画面に集中し長大。検索/ページングなしで大量データ時に探しづらい。 |
| P1 | 操作性 | `packages/web/src/views/admin/round/AdminRoundAllocation.vue` | 上部の操作ボタンと自動生成設定が密集し、セクション分割や折り畳みがないため目的の設定に到達しづらい。 |
| P1 | 操作性 | `packages/web/src/components/results/ResultsEditor.vue` | JSON 直接編集が前提で、構造化入力がない。誤入力リスクが高い。 |
| P1 | 一貫性 | `packages/web/src/styles.css` + 各ビュー | `.primary`/`.ghost` を画面ごとに再定義し、角丸/余白/サイズが不一致（例: `AppHeader.vue` は pill 形状）。 |
| P1 | 一貫性 | `Login.vue`, `AdminHome.vue`, `AdminTournamentSubmissions.vue`, `ResultsEditor.vue` | `input/select/textarea` のスタイルがビューごとに重複・差分あり。フォーム外観が統一されていない。 |
| P1 | 視認性/翻訳 | `packages/web/src/components/mstat/*` | チャートのタイトル/軸/凡例が英語固定（例: `ScoreHistogram.vue` の "Score Histogram"）。日本語 UI と不整合。 |
| P1 | 翻訳 | `packages/web/src/views/admin/AdminTournamentResults.vue`, `packages/web/src/views/user/UserTournamentResults.vue`, `packages/web/src/components/common/DraggableList.vue` | `title="Results"` や `Enable/Disable` など英語固定文言が存在。2言語対応で揺れが出る。 |
| P2 | アクセシビリティ | `packages/web/src/views/admin/AdminTournamentHome.vue` | エンティティ追加フォームがプレースホルダ中心でラベルがない入力が多い。スクリーンリーダー/エラー理解に弱い。 |
| P2 | アクセシビリティ | `packages/web/src/styles.css`（全体） | `:focus-visible` などのフォーカスリング未定義。キーボード操作で現在地が分かりにくい。 |
| P2 | 視認性 | `packages/web/src/views/admin/AdminTournamentSubmissions.vue` | JSON を `pre` で常時表示し、一覧の視認性が低い。折り畳み/詳細表示がない。 |
| P2 | 一貫性 | 複数ビュー | `.list`/`.list-item` が各画面で別実装（`AdminHome.vue`, `UserHome.vue`, `ResultsEditor.vue` など）。密度と余白にばらつき。 |
| P2 | 操作性 | `packages/web/src/components/common/AppHeader.vue` | 現在地の強調がなく、管理/参加者のどちらにいるかが視覚的に分かりにくい。 |
| P2 | 視認性 | `packages/web/src/views/admin/AdminTournamentCompiled.vue` | 警告行の表示に `>` が混入（`{{ roundName(r) }}>`）。表示ノイズになる。 |
