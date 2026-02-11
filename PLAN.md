# UTab Plan

最終更新: 2026-02-10

## 今やること（全体）

- [ ] `legacy/` の扱いを決める（アーカイブ/削除/別リポジトリ移管）
- [ ] ステージング→本番のデプロイ手順を固める（`DEPLOYMENT.md`）
- [ ] UI 改善を進める（詳細: `docs/ui/ui-modernization-plan.md`）

---

## Tab アップデート計画（未完了）

### 方針（Lightweight Tab）

- **コアロジック（配席/集計順位アルゴリズム）を変更しない改善を最優先**にする
- 仕様確定が必要なもの・コア変更が必要なもの・Tab 内実装が必須ではないものを分けて進める
- メール送信/証明書など運用コストが高いものは **外部連携を基本** とし、Tab 側は **CSV/JSON 出力** を強化する

### 進捗

- 2026-02-08: Phase 1 の `T01〜T06` を先行実装済み（詳細は `docs/migration/tab-update-roadmap-2026-02-08.md` を参照）

---

### Phase 1（先行: コアロジック非変更）

- [ ] **T07. 負荷試験と閾値調整（R21）**
  - 目的: 大規模大会で提出集中時の詰まりを事前検知
  - 変更候補:
    - `packages/server/src/middleware/rate-limit.ts`
    - `packages/server/src/app.ts`
    - `packages/server/src/config/environment.ts`
    - `scripts/load/submissions.k6.js`（新規）
    - `docs/security-roadmap.md`（運用Runbook追記）
  - メモ: 現状 `submissions` は `5分120req/IP`。学校内NATで集中すると詰まる可能性あり

---

### Phase 2（中期: 非コア〜軽微ロジック、要件確認あり）

- [ ] **T08. 提出済みバロット編集（名前変更/追加）（R05）**
  - 目的: 入力ミスのリカバリを管理画面で完結
  - 変更候補:
    - `packages/server/src/controllers/submissions.ts`
    - `packages/server/src/routes/submissions.ts`
    - `packages/web/src/stores/submissions.ts`
    - `packages/web/src/views/admin/AdminTournamentSubmissions.vue`
    - `packages/server/test/integration.test.ts`

- [ ] **T09. ジャッジ組み合わせインポート（ラウンド別）（R13）**
  - 目的: 当日手動作業を削減
  - 変更候補:
    - `packages/web/src/views/admin/round/AdminRoundAllocation.vue`
    - `packages/server/src/controllers/draws.ts`（複数ラウンド一括投入を行う場合）
    - `packages/server/src/routes/draws.ts`
    - `packages/server/test/integration.test.ts`

- [ ] **T10. 引き分け許容の集計仕様（R04）**
  - 目的: 勝敗同点でもランキング生成を継続
  - 変更候補:
    - `packages/web/src/views/user/participant/round/ballot/UserRoundBallotEntry.vue`
    - `packages/server/src/controllers/compiled.ts`
    - `packages/server/src/routes/submissions.ts`
    - `packages/server/test/integration.test.ts`
  - 仕様決定:
    - `team_num=2` の tie を `0.5-0.5` とするか、`0-0` とするか
    - score未入力ラウンド時の tie 処理

- [ ] **T11. 同名二重入力時の正規化（R07）**
  - 目的: 2人チーム/PD4での重複入力を集計で吸収
  - 変更候補:
    - `packages/server/src/controllers/compiled.ts`
    - `packages/server/test/integration.test.ts`
  - 仕様決定:
    - 平均化単位（speaker slot単位 or unique speaker単位）
    - best/poi の `0/1` 正規化ルール

- [ ] **T12. 内容/表現の分離入力・修正（R08）**
  - 目的: 採点軸を明示して後編集可能にする
  - 変更候補:
    - `packages/web/src/views/user/participant/round/ballot/UserRoundBallotEntry.vue`
    - `packages/web/src/views/admin/AdminTournamentSubmissions.vue`
    - `packages/server/src/controllers/submissions.ts`
    - `packages/server/src/routes/submissions.ts`

---

### Phase 3（要検討: コアロジック変更）

- [ ] **T13. ランキング優先度の設定（R03）**
  - 目的: 大会ごとに `win/sum/margin/vote/sd` の優先順位を切替
  - 変更候補:
    - `packages/core/src/general/sortings.ts`
    - `packages/core/src/results/results.ts`
    - `packages/server/src/controllers/compiled.ts`
    - `packages/server/src/routes/compiled.ts`
    - `packages/web/src/views/admin/AdminTournamentCompiled.vue`
    - `packages/core/tests/results-compile-advanced.test.ts`
    - `packages/server/test/integration.test.ts`

- [ ] **T14. conflict種別/優先度のモデル化（R11）**
  - 目的: チーム/学校/都道府県衝突を一元管理
  - 変更候補:
    - `packages/server/src/models/adjudicator.ts`
    - `packages/server/src/models/institution.ts`
    - `packages/server/src/controllers/adjudicators.ts`
    - `packages/web/src/types/adjudicator.ts`
    - `packages/web/src/types/institution.ts`
    - `packages/web/src/views/admin/AdminTournamentHome.vue`
    - `packages/core/src/allocations/adjudicators/adjfilters.ts`
    - `packages/core/src/allocations/adjudicators.ts`

- [ ] **T15. auto allocation新要素（R16）**
  - 目的: 同校複数チームや地域偏りの最適化
  - 変更候補:
    - `packages/core/src/allocations/teams/filters.ts`
    - `packages/core/src/allocations/teams.ts`
    - `packages/server/src/controllers/allocations.ts`
    - `packages/web/src/views/admin/round/AdminRoundAllocation.vue`
    - `packages/core/tests/allocations-teams.test.ts`
    - `packages/core/tests/allocations-teams-strict.test.ts`

---

### Phase 4（Tab導入の要否を再評価）

- [ ] **T16. メール通知/コメントシート（R01, R18）**
  - 判定: Tab内実装は後回し推奨（外部運用/連携）
  - 理由: 連絡先管理・SMTP運用・送信失敗再送・個人情報管理の運用コストが高い
  - 代替案: Tabから `CSV/JSON出力` を強化して外部パイプラインへ連携

- [ ] **T17. 賞状/参加証明書自動生成（R19, R20）**
  - 判定: Tab内実装は非推奨（外部文書基盤推奨）
  - 代替案: Tabから受賞者/参加者CSVを出力し、既存PowerPoint/GAS等へ連携

---

### 先に決めるべき仕様（ブロッカー）

1. 引き分け時の勝敗点（`0.5/0` など）
2. 「内容/表現」の定義（既存 `Matter/Manner` へ寄せるか）
3. conflictの優先順位（個別 > 学校 > 都道府県 など）
4. 地域分散の単位（都道府県/地区）とデータソース
5. コメントシート・証明書のTab内実装要否

---

## モダン化・統合移行計画（完了済み）

### セキュリティロードマップ進捗（2026-02-08）

- Phase 8（移行と回帰テスト）を実装済み
- `packages/server/src/scripts/migrate-security-phase8.ts` を追加
  - パスワード未設定大会の `auth.access.required` 補正（`false`）
  - 旧平文 `auth.access.password` の `passwordHash` 化
  - `User.tournaments` / `Tournament.createdBy` から `TournamentMember` をバックフィル
- 実行コマンド: `pnpm -C packages/server migrate-security-phase8`
- 統合テストに Phase 8 回帰ケースを追加

### 移行ドキュメント

- [現状分析レポート](docs/legacy-analysis.md)
- [目標アーキテクチャ](docs/architecture-v2.md)
- [移行タスク詳細](docs/migration/)

### 移行ステータス（2026-02-08）

| タスク | 概要 | ステータス | 備考 |
| :--- | :--- | :--- | :--- |
| **Task 1** | プロジェクト構成設計 | ✅ 完了 | [詳細](docs/migration/task1-foundation.md) |
| **Task 2** | レポジトリ初期化 | ✅ 完了 | |
| **Task 3** | TS環境セットアップ | ✅ 完了 | [詳細](docs/migration/task3-types.md) |
| **Task 4** | Coreパッケージ移行 | ✅ 完了 | [詳細](docs/migration/task4-core.md) |
| **Task 5** | Serverパッケージ移行 | ✅ 完了 | Express + TS化完了 |
| **Task 6** | Webパッケージ移行 | ✅ 完了 | Vue 3 + Vite化完了 |
| **Task 7** | ビルド設定統合 | ✅ 完了 | Turbo導入 |
| **Task 8** | インフラ更新 | ✅ 完了 | Node 20+, Mongo 7+ |
| **Task 9** | テスト・CI設定 | ✅ 完了 | Vitest導入 |
| **Task 10** | ドキュメント整備 | ✅ 完了 | 本ドキュメント他 |
| **Task 11** | 動作検証 | ✅ 完了 | [詳細](docs/migration/task11-validation.md) |
| **Task 12** | デプロイ準備 | ✅ 完了 | |

---

## 継続開発ガードレール（UI統一）

- [ ] 新規UI追加・既存UI変更時は、`docs/ui/button-guidelines.md` の運用ルールに沿ってボタン種別を選ぶ
- [ ] タブ/表示切替は「実行ボタン」ではなくセグメントUIとして実装する
- [ ] 1つのカード/モーダル内で `primary` を複数並べない（主操作は原則1つ）
- [ ] 破壊的操作のみ `danger` を使い、戻る/閉じる/補助操作は `ghost` または `secondary` を使う
- [ ] PR前に以下を必須実行する
  - `pnpm --filter @utab/web typecheck`
  - `pnpm --filter @utab/web test`
- [ ] UI関連変更を入れたPRでは、影響画面を `docs/ui/ui-map.md` に追記・更新する
- [ ] 文言追加・変更時は `docs/ui/ui-i18n-guidelines.md` の用語方針（Draw/Ballot/Adjudicator）と英語デフォルト方針を確認する

### UI Philosophy（詳細）

1. 目的
- 「最初に見る人が、次に押すべき操作を迷わない」ことを最優先にする。
- 同じ意味の操作は、画面が違っても同じ見た目・同じ位置関係で表現する。

2. 操作優先度の原則
- `primary`: その領域で最重要の実行操作。原則1つのみ。
- `secondary`: 実行操作だが主操作ではないもの（遷移・更新・コピー等）。
- `ghost`: 補助操作（戻る、閉じる、展開、詳細表示）。
- `danger`: 破壊的操作のみ（削除、全削除）。

3. ナビゲーションの原則
- タブ、表示切替、モード切替は「実行ボタン」と分離してセグメントUIで扱う。
- active状態は「薄い強調背景 + ブランド色文字」を基本とし、濃色塗りは多用しない。
- `admin/:tournamentId` 配下と `user/:tournamentId` 配下で、同種UIは同じトーンに揃える。

4. 視覚トークンの原則
- 色・余白・角丸は既存トークン（`packages/web/src/styles.css`）を優先し、個別色の直書きを増やさない。
- 新しいUIパーツは既存コンポーネント（`Button`, `Field`, `Table`, `ReloadButton`）を再利用する。
- 単発の例外スタイルを追加した場合は、後続で共通化できるかを必ず検討する。

5. 実装時チェック（Definition of Done）
- 新規/変更UIが `docs/ui/button-guidelines.md` と矛盾しない。
- active/inactive/hover/disabled の状態差が視認可能で、意味づけが一貫している。
- 同一画面内で `primary` が複数存在しない。
- 影響範囲を `docs/ui/ui-map.md` に追記済み。
- `pnpm --filter @utab/web typecheck` と `pnpm --filter @utab/web test` が通過している。

6. レビュー観点（UI崩れ防止）
- 「この操作は本当に `ghost` か？」を必ずレビューで確認する。
- 「これはタブか、実行ボタンか？」を分離して命名・見た目を決める。
- 既存画面との比較スクリーンショットで、色調と操作階層の不整合を確認する。
