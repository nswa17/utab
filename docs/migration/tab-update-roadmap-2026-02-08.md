# Tabシステム更新要望 ロードマップ（2026-02-08）

## 0. 前提
- この検討は、現行実装（`/Users/neon/Desktop/utab`）をベースにしています。
- 優先順位は「コアロジック（配席/集計順位アルゴリズム）を変更しないもの」を最上位にしています。
- 「要検討」は、仕様確定が必要なもの・コアロジック変更が必要なもの・Tab内実装が必須ではないものを分けています。

## 1. 判定サマリ

### 1-1. 先行実装（コア変更なし・短期）
1. [x] `CSV compile` の序数表記統一（`21th -> 21st`）
2. [x] `allocation` 画面の待機リスト（配置済み/非available）の折りたたみ・非表示
3. [x] `allocation` の公開前プレビュー（部屋順 / Win順）
4. [x] `Result/Submissions` 画面での表示改善（サイド/チーム/スピーカー順・件数可視化）
5. [x] 表彰者のコピー用フォーマット出力
6. [x] 事前CSVの拡張（ジャッジ availability・基本 conflict 列）

> 2026-02-08 完了記録: 上記 `1-1` の6項目を先行実装済み（`T07` は対象外）。

### 1-2. 非コアだが中工数（要件確定後）
1. 提出済みバロットの名前変更・追加（Submission編集API追加）
2. ジャッジ組み合わせのラウンド別インポート
3. 引き分け時の結果表示（勝敗点の定義が必要）
4. 「内容/表現」の分離入力・修正UI（現行 `Matter/Manner` との整合）
5. 同一名二重入力時の平均化/賞点正規化（2人チーム・PD4）

### 1-3. コアロジック変更が必要（要検討）
1. ランキング優先度の可変化（`win/sum/margin/sd` の優先順位設定）
2. auto allocation の新要素（同校サイド分散、同校別チーム対戦履歴回避、地域分散）
3. conflict種別（チーム/学校/都道府県）と重み付け優先度の導入

### 1-4. Tab内導入の必要性を要検討（外部連携推奨）
1. 送信メール控え（SMTP/個人情報管理が必要）
2. コメントシート収集→PDF化→メール送信
3. 賞状自動生成
4. 参加証明書作成/送付

### 1-5. 取りこぼし再点検（2026-02-08）
- 元要望の列挙項目を再照合し、`R01` から `R21` までの対応先は全件マッピング済み（未割当なし）。

## 2. 要望別トリアージ

| ID | 要望 | 可否 | 優先度 | 難易度 | コア変更 | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| R01 | バロット送信内容のメール控え | 条件付き可 | P2 | L | なし | SMTP/宛先管理追加が必要。Tab内必須ではないため要検討 |
| R02 | CSV compile 序数表記修正 | 可 | P0 | S | なし | 先行対応 |
| R03 | ランキング指標の並び替え/優先度設定 | 可 | P2 | L | あり | 集計比較ロジック変更のため要検討 |
| R04 | 引き分けでもランキング表示 | 可 | P1 | M | 軽微 | 勝敗点の定義（0.5/0/別軸）要決定 |
| R05 | 提出済みバロットの名前変更・追加 | 可 | P1 | M | なし | Submission更新API追加で対応 |
| R06 | 提出済みバロットにサイド/チーム/順序表示 | 可 | P0 | M | なし | UI拡張で対応 |
| R07 | 同名二重入力時の平均化・賞0/1化 | 可 | P1 | M-L | 軽微 | compile変換ロジックの仕様追加 |
| R08 | 点数表示を内容/表現に分離し修正 | 可 | P2 | M | 軽微 | 既存Matter/Mannerとの仕様統一が必要 |
| R09 | 勝敗/スコアのバロット数可視化・整列 | 可 | P0 | S-M | なし | 先行対応 |
| R10 | 勝敗のみ運用で部屋順「A vs B X-Y」表示 | 可 | P0 | S-M | なし | 先行対応 |
| R11 | conflict一括CSV（学校/都道府県/優先度） | 条件付き可 | P2 | L | あり | データモデル再設計が必要 |
| R12 | ジャッジavailabilityをCSV入力時設定 | 可 | P0 | S-M | なし | 先行対応 |
| R13 | ジャッジ組み合わせのラウンド別インプット | 可 | P1 | M | なし | Draw取込UI/APIを追加 |
| R14 | allocation下部リストの非表示/縮小 | 可 | P0 | S | なし | 先行対応 |
| R15 | allocation公開前preview（部屋順/Win順） | 可 | P0 | M | なし | 先行対応 |
| R16 | auto allocation要素追加（3点） | 可 | P2 | L-XL | あり | team filter/データ拡張が必要 |
| R17 | 表彰者コピー（名前+チーム+回数） | 可 | P0 | S | なし | 先行対応 |
| R18 | コメントシート入力→送信 | 条件付き可 | P3 | XL | なし | 外部運用（GAS）継続が現実的 |
| R19 | 賞状自動生成 | 条件付き可 | P3 | XL | なし | Tab外の文書生成基盤が必要 |
| R20 | 参加証明書の自動生成/送付 | 条件付き可 | P3 | XL | なし | Tab外の文書生成基盤が必要 |
| R21 | 100チーム超＋評価入力時の耐性確認 | 可 | P0 | M | なし | 負荷試験とRateLimit調整を先行 |

## 3. フェーズ別ロードマップ

## Phase 1（先行: コアロジック非変更）

### T01. 序数表記の統一（R02）【完了 2026-02-08】
- 目的: 序数表記を全画面/CSVで統一
- 変更ファイル:
  - `/Users/neon/Desktop/utab/packages/web/src/utils/math.ts`
  - `/Users/neon/Desktop/utab/packages/web/src/components/slides/SlidesWrapper.vue`
  - `/Users/neon/Desktop/utab/packages/web/src/utils/math.test.ts`（新規）
- 補足: `AdminTournamentCompiled.vue` 側はすでに英語序数例外処理あり。util側の未統一を解消

### T02. allocation待機リストの表示切替（R14）【完了 2026-02-08】
- 目的: スクリーンショット時に1画面へ収めやすくする
- 変更ファイル:
  - `/Users/neon/Desktop/utab/packages/web/src/views/admin/round/AdminRoundAllocation.vue`
  - `/Users/neon/Desktop/utab/packages/web/src/styles.css`

### T03. allocation公開前プレビュー（部屋順/Win順）追加（R15）【完了 2026-02-08】
- 目的: 公開前確認を事故なく実施できるようにする
- 変更ファイル:
  - `/Users/neon/Desktop/utab/packages/web/src/views/admin/round/AdminRoundAllocation.vue`
  - `/Users/neon/Desktop/utab/packages/web/src/router/index.ts`（別画面化する場合）
  - `/Users/neon/Desktop/utab/packages/web/src/views/admin/round/AdminRoundIndex.vue`（導線追加）

### T04. Result/Submissions表示改善（R06, R09, R10）【完了 2026-02-08】
- 目的: 提出済みバロットの照合工数を削減
- 変更ファイル:
  - `/Users/neon/Desktop/utab/packages/web/src/views/admin/AdminTournamentSubmissions.vue`
  - `/Users/neon/Desktop/utab/packages/web/src/views/admin/round/AdminRoundResult.vue`
  - `/Users/neon/Desktop/utab/packages/web/src/stores/draws.ts`
  - `/Users/neon/Desktop/utab/packages/web/src/stores/teams.ts`
  - `/Users/neon/Desktop/utab/packages/web/src/stores/speakers.ts`

### T05. 表彰者コピー形式の追加（R17）【完了 2026-02-08】
- 目的: 「名前（チーム名）表彰回数」形式で即コピー
- 変更ファイル:
  - `/Users/neon/Desktop/utab/packages/web/src/views/admin/AdminTournamentCompiled.vue`
  - `/Users/neon/Desktop/utab/packages/web/src/i18n/messages.ts`

### T06. 事前CSVの軽量拡張（availability/conflict基本列）（R12）【完了 2026-02-08】
- 目的: 手動編集量を削減
- 変更ファイル:
  - `/Users/neon/Desktop/utab/packages/web/src/views/admin/AdminTournamentHome.vue`
  - `/Users/neon/Desktop/utab/packages/web/src/types/adjudicator.ts`
  - `/Users/neon/Desktop/utab/packages/web/src/i18n/messages.ts`
- 補足: まずは「個別conflict（チームID/チーム名）」と「round availability」を対象に限定

### T07. 負荷試験と閾値調整（R21）
- 目的: 全国大会規模で提出集中時の詰まりを事前検知
- 変更ファイル:
  - `/Users/neon/Desktop/utab/packages/server/src/middleware/rate-limit.ts`
  - `/Users/neon/Desktop/utab/packages/server/src/app.ts`
  - `/Users/neon/Desktop/utab/packages/server/src/config/environment.ts`
  - `/Users/neon/Desktop/utab/scripts/load/submissions.k6.js`（新規）
  - `/Users/neon/Desktop/utab/docs/security-roadmap.md`（運用Runbook追記）
- 補足: 現状 `submissions` は `5分120req/IP`。学校内NATで集中すると詰まる可能性あり

## Phase 2（中期: 非コア〜軽微ロジック、要件確認あり）

### T08. 提出済みバロット編集（名前変更/追加）（R05）
- 目的: 入力ミスのリカバリを管理画面で完結
- 変更ファイル:
  - `/Users/neon/Desktop/utab/packages/server/src/controllers/submissions.ts`
  - `/Users/neon/Desktop/utab/packages/server/src/routes/submissions.ts`
  - `/Users/neon/Desktop/utab/packages/web/src/stores/submissions.ts`
  - `/Users/neon/Desktop/utab/packages/web/src/views/admin/AdminTournamentSubmissions.vue`
  - `/Users/neon/Desktop/utab/packages/server/test/integration.test.ts`

### T09. ジャッジ組み合わせインポート（ラウンド別）（R13）
- 目的: 当日手動作業を削減
- 変更ファイル:
  - `/Users/neon/Desktop/utab/packages/web/src/views/admin/round/AdminRoundAllocation.vue`
  - `/Users/neon/Desktop/utab/packages/server/src/controllers/draws.ts`（複数ラウンド一括投入を行う場合）
  - `/Users/neon/Desktop/utab/packages/server/src/routes/draws.ts`
  - `/Users/neon/Desktop/utab/packages/server/test/integration.test.ts`

### T10. 引き分け許容の集計仕様（R04）
- 目的: 勝敗同点でもランキング生成を継続
- 変更ファイル:
  - `/Users/neon/Desktop/utab/packages/web/src/views/user/participant/round/ballot/UserRoundBallotEntry.vue`
  - `/Users/neon/Desktop/utab/packages/server/src/controllers/compiled.ts`
  - `/Users/neon/Desktop/utab/packages/server/src/routes/submissions.ts`
  - `/Users/neon/Desktop/utab/packages/server/test/integration.test.ts`
- 仕様決定が必要:
  - `team_num=2` の tie を `0.5-0.5` とするか、`0-0` とするか
  - score未入力ラウンド時の tie 処理

### T11. 同名二重入力時の正規化（R07）
- 目的: 2人チーム/PD4での重複入力を集計で吸収
- 変更ファイル:
  - `/Users/neon/Desktop/utab/packages/server/src/controllers/compiled.ts`
  - `/Users/neon/Desktop/utab/packages/server/test/integration.test.ts`
- 仕様決定が必要:
  - 平均化単位（speaker slot単位 or unique speaker単位）
  - best/poi の `0/1` 正規化ルール

### T12. 内容/表現の分離入力・修正（R08）
- 目的: 採点軸を明示して後編集可能にする
- 変更ファイル:
  - `/Users/neon/Desktop/utab/packages/web/src/views/user/participant/round/ballot/UserRoundBallotEntry.vue`
  - `/Users/neon/Desktop/utab/packages/web/src/views/admin/AdminTournamentSubmissions.vue`
  - `/Users/neon/Desktop/utab/packages/server/src/controllers/submissions.ts`
  - `/Users/neon/Desktop/utab/packages/server/src/routes/submissions.ts`

## Phase 3（要検討: コアロジック変更）

### T13. ランキング優先度の設定（R03）
- 目的: 大会ごとに `win/sum/margin/vote/sd` の優先順位を切替
- 変更ファイル:
  - `/Users/neon/Desktop/utab/packages/core/src/general/sortings.ts`
  - `/Users/neon/Desktop/utab/packages/core/src/results/results.ts`
  - `/Users/neon/Desktop/utab/packages/server/src/controllers/compiled.ts`
  - `/Users/neon/Desktop/utab/packages/server/src/routes/compiled.ts`
  - `/Users/neon/Desktop/utab/packages/web/src/views/admin/AdminTournamentCompiled.vue`
  - `/Users/neon/Desktop/utab/packages/core/tests/results-compile-advanced.test.ts`
  - `/Users/neon/Desktop/utab/packages/server/test/integration.test.ts`

### T14. conflict種別/優先度のモデル化（R11）
- 目的: チーム/学校/都道府県衝突を一元管理
- 変更ファイル:
  - `/Users/neon/Desktop/utab/packages/server/src/models/adjudicator.ts`
  - `/Users/neon/Desktop/utab/packages/server/src/models/institution.ts`
  - `/Users/neon/Desktop/utab/packages/server/src/controllers/adjudicators.ts`
  - `/Users/neon/Desktop/utab/packages/web/src/types/adjudicator.ts`
  - `/Users/neon/Desktop/utab/packages/web/src/types/institution.ts`
  - `/Users/neon/Desktop/utab/packages/web/src/views/admin/AdminTournamentHome.vue`
  - `/Users/neon/Desktop/utab/packages/core/src/allocations/adjudicators/adjfilters.ts`
  - `/Users/neon/Desktop/utab/packages/core/src/allocations/adjudicators.ts`

### T15. auto allocation新要素（R16）
- 目的: 同校複数チームや地域偏りの最適化
- 変更ファイル:
  - `/Users/neon/Desktop/utab/packages/core/src/allocations/teams/filters.ts`
  - `/Users/neon/Desktop/utab/packages/core/src/allocations/teams.ts`
  - `/Users/neon/Desktop/utab/packages/server/src/controllers/allocations.ts`
  - `/Users/neon/Desktop/utab/packages/web/src/views/admin/round/AdminRoundAllocation.vue`
  - `/Users/neon/Desktop/utab/packages/core/tests/allocations-teams.test.ts`
  - `/Users/neon/Desktop/utab/packages/core/tests/allocations-teams-strict.test.ts`

## Phase 4（Tab導入の要否を再評価）

### T16. メール通知/コメントシート（R01, R18）
- 判定: **Tab内実装は後回し推奨**
- 理由: 連絡先管理・SMTP運用・送信失敗再送・個人情報管理の運用コストが高い
- 代替案: 既存GAS運用を継続し、Tabは `CSV/JSON出力` を強化
- Tab内実装する場合の主な変更ファイル:
  - `/Users/neon/Desktop/utab/packages/server/src/config/environment.ts`
  - `/Users/neon/Desktop/utab/packages/server/src/services/mailer.ts`（新規）
  - `/Users/neon/Desktop/utab/packages/server/src/controllers/submissions.ts`
  - `/Users/neon/Desktop/utab/packages/server/src/models/team.ts`（連絡先項目追加）

### T17. 賞状/参加証明書自動生成（R19, R20）
- 判定: **Tab内実装は非推奨（外部文書基盤推奨）**
- 理由: テンプレート管理、PDFレンダリング、差し込み、配布運用まで含むため別系統の業務基盤
- 代替案: Tabから受賞者/参加者CSVを出力し、既存PowerPoint/GASパイプラインへ連携

## 4. 実行順（提案）
1. Phase 1を先行（T01-T07）
2. その後、運営頻度の高いPhase 2（T08-T10優先、T11-T12は仕様確定後）
3. Phase 3は大会要件が固定してから着手（T13-T15）
4. Phase 4は「Tab内で本当に持つべきか」を運用側と再判断

## 5. 先に決めるべき仕様（ブロッカー）
1. 引き分け時の勝敗点（`0.5/0` など）
2. 「内容/表現」の定義（既存 `Matter/Manner` へ寄せるか）
3. conflictの優先順位（個別 > 学校 > 都道府県 など）
4. 地域分散の単位（都道府県/地区）とデータソース
5. コメントシート・証明書のTab内実装要否
