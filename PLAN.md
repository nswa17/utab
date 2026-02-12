# UTab Plan

最終更新: 2026-02-12

## 今やること（全体）

- [ ] `legacy/` の扱いを決める（アーカイブ/削除/別リポジトリ移管）
- [ ] ステージング→本番のデプロイ手順を固める（`DEPLOYMENT.md`）
- [ ] UI 改善を進める（詳細: `docs/ui/ui-modernization-plan.md`）

---

## Tab アップデート計画（未完了）

### 方針（2026-02-12更新）

- レポート生成画面を中心に、集計オプション・差分確認・提出状況確認を一体化する
- 必要なコアロジック変更（ランキング比較・引き分け・正規化）は許容し、後方互換を維持して段階導入する
- ラウンド管理の提出関連機能は当面併設し、利用実績を見て主導線をレポート生成側へ寄せる
- メール/証明書など運用コストが高いものは外部連携を基本とし、Tab側はデータ出力を強化する

### 進捗

- 2026-02-08: Phase 1 の `T01〜T06` を先行実装済み（詳細は `docs/migration/tab-update-roadmap-2026-02-08.md` を参照）
- 2026-02-12: `T18`（集計オプション拡張）と `T19`（集計ロジック統合）の MVP を実装し、Core/Server/Web の関連テストを追加・更新
- 2026-02-12: `T20`（差分表示基盤）`T21`（説明付きUI）`T22`（提出データ機能統合）の MVP を実装し、差分算出・凡例・ヘルプ・提出サマリをレポート生成画面へ統合
- 2026-02-12: `T23`（回帰観点の安定化）`T07`（レート制限の閾値調整）を実装し、公開compiledレスポンスの情報最小化・閾値の環境変数化・回帰テスト観点を反映

---

### 実行順サマリ（依存関係ベース）

1. 仕様確定（ブロッカー解消）
2. 集計基盤拡張（`T18`）
3. 集計ロジック統合（`T19`）
4. レポート生成UI統合（`T20` / `T21` / `T22`）
5. 段階リリースと負荷確認（`T23` / `T07`）
6. 周辺機能（`T08` / `T09` / `T12` / `T14` / `T15` / `T24` / `T25` / `T26`）
7. 外部連携領域の再評価（`T16` / `T17`）

---

### Phase 1（最優先: 集計基盤）

- [x] **T18. 集計オプション拡張（API/型/保存形式）**
  - 目的: 生成時の判断を明示し、再現可能な集計を作る。システムの根幹に関わるので慎重に変更を行う。
  - 追加対象オプション:
    - `ranking_priority`: 順位比較の優先順位（プリセット=現行維持 / カスタム=全項目から任意順）
    - `winner_policy`: 勝者/引き分け判定のルール（winnerId優先/スコアから推定/未選択=引き分け 等）
    - `tie_points`: 引き分け時の勝敗点（決定: `0.5-0.5`）
    - `duplicate_normalization`: 重複入力のマージ方針 + best/poi 集計（`average` / `max`）
    - `missing_data_policy`: 欠損時（警告のみ/除外/エラー停止。デフォルト=`warn`）
    - `include_labels`: teams/speakers/adjudicators/poi/best の生成対象
    - `diff_baseline`: 比較対象（最新/指定compiled）
  - 変更候補:
    - `packages/server/src/routes/compiled.ts`
    - `packages/server/src/controllers/compiled.ts`
    - `packages/server/src/models/compiled.ts`
    - `packages/web/src/stores/compiled.ts`
    - `packages/web/src/views/admin/AdminTournamentCompiled.vue`
    - `packages/server/test/integration.test.ts`

---

### Phase 2（最優先: 集計ロジック）

- [x] **T19. 集計ロジック統合実装（旧T10/T11/T13を包含）**
  - 目的: 追加オプションを実際の集計結果へ反映
  - 実装内容:
    - ランキング優先順位の可変化（既存固定比較の置換）
    - `winner_policy` に従って勝者/引き分けを判定（ラウンド設定で引き分け可否を制御。デフォルト=可）
    - 引き分け時の勝敗点は `0.5-0.5` として集計（勝敗点=win は小数を許容）
    - 引き分け不可のラウンドは「引き分けになる入力」を提出不可にする（UI + API）
    - 重複入力のマージ（同一試合/同一speakerId/同一round）と best/poi 集計（`average` / `max`）
    - 欠損データポリシーに応じた対象除外/停止
  - 変更候補:
    - `packages/core/src/general/sortings.ts`
    - `packages/core/src/results/results.ts`
    - `packages/server/src/controllers/compiled.ts`
    - `packages/web/src/views/user/participant/round/ballot/UserRoundBallotEntry.vue`
    - `packages/server/src/controllers/submissions.ts`
    - `packages/server/src/routes/submissions.ts`
    - `packages/core/tests/results-compile-advanced.test.ts`
    - `packages/server/test/integration.test.ts`

---

### Phase 3（高優先: レポート生成UI統合）

- [x] **T20. 差分表示基盤（機能6）**
  - 目的: 前回からの変化を一目で分かる形で提示
  - 実装内容:
    - 順位・主要指標の差分を算出して payload に付与
    - UIで簡易アイコン表示（色付き三角）
      - 上向き三角: 改善
      - 下向き三角: 悪化
      - 横三角/点: 変化なし
    - 画面内に凡例を常設し、意味を固定表示
  - 変更候補:
    - `packages/server/src/controllers/compiled.ts`
    - `packages/web/src/views/admin/AdminTournamentCompiled.vue`
    - `packages/web/src/components/common/*`（差分バッジ部品を新設する場合）
    - `packages/web/src/i18n/messages.ts`

- [x] **T21. 説明付きUI（ホバー/フォーカスで意味が分かる）**
  - 目的: レポート生成者がオプションの意味を迷わず理解できる状態にする
  - 実装内容:
    - すべての詳細オプションに `?` ヘルプ（ホバー対応）
    - 設定値に応じた「この設定だとどう集計されるか」の要約文を即時表示
    - 差分アイコン・各指標の意味にも同様の説明を付与
  - 変更候補:
    - `packages/web/src/views/admin/AdminTournamentCompiled.vue`
    - `packages/web/src/components/common/`（Tooltip/HelpTipを共通化する場合）
    - `packages/web/src/i18n/messages.ts`
    - `docs/ui/ui-qa-checklist.md`

- [x] **T22. 提出データ機能の統合（ラウンド管理→レポート生成）**
  - 目的: 提出状況確認→集計→差分確認を1画面で完結
  - 実装内容:
    - レポート生成画面に提出データの要約・不足・重複・異常を集約表示
    - 既存ラウンド管理画面には「要約 + レポート生成へ遷移」導線を残す
    - 初期は両画面併設、利用実績を見て主導線を一本化（=最終的に「どこに何があるか」を減らす）
  - 変更候補:
    - `packages/web/src/views/admin/AdminTournamentCompiled.vue`
    - `packages/web/src/views/admin/AdminTournamentRounds.vue`
    - `packages/web/src/views/admin/AdminTournamentSubmissions.vue`
    - `packages/web/src/stores/submissions.ts`

---

### Phase 4（高優先: 安定化・リリース）

- [x] **T23. 段階リリース・回帰試験**
  - 目的: 既存大会運用を壊さずに新UIへ移行
  - 実装内容:
    - 回帰観点: 旧設定を利用時の集計一致性、CSV出力、公開結果表示、パフォーマンス
  - 変更候補:
    - `packages/web/src/views/admin/AdminTournamentCompiled.vue`
    - `packages/server/test/integration.test.ts`
    - `packages/core/tests/results-compile-advanced.test.ts`
    - `docs/ui/ui-modernization-plan.md`
    - `docs/ui/ui-qa-checklist.md`

- [x] **T07. 負荷試験と閾値調整（R21）**
  - 目的: 大規模大会で提出集中時の詰まりを防止
  - 変更候補:
    - `packages/server/src/middleware/rate-limit.ts`
    - `packages/server/src/app.ts`
    - `packages/server/src/config/environment.ts`
    - `docs/security-roadmap.md`（運用Runbook追記）

---

### Phase 5（中優先: 周辺機能）

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

- [ ] **T12. 内容/表現の分離入力・修正（R08）**
  - 目的: 採点軸を明示して後編集可能にする
  - 変更候補:
    - `packages/web/src/views/user/participant/round/ballot/UserRoundBallotEntry.vue`
    - `packages/web/src/views/admin/AdminTournamentSubmissions.vue`
    - `packages/server/src/controllers/submissions.ts`
    - `packages/server/src/routes/submissions.ts`

- [ ] **T14. conflict種別/優先度のモデル化（R11）**
  - 目的: チーム/学校/任意属性（例: 地域）衝突を一元管理（「地域」ハードコードは避ける）
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
  - 目的: 同校複数チームや「任意属性（例: 地域）」偏りの最適化（地域ハードコードは避ける）
  - 変更候補:
    - `packages/core/src/allocations/teams/filters.ts`
    - `packages/core/src/allocations/teams.ts`
    - `packages/server/src/controllers/allocations.ts`
    - `packages/web/src/views/admin/round/AdminRoundAllocation.vue`
    - `packages/core/tests/allocations-teams.test.ts`
    - `packages/core/tests/allocations-teams-strict.test.ts`

- [ ] **T26. チームドロー: Tabbycat-style power pairing アルゴリズム（R16拡張）**
  - 目的: Gale–Shapley ベース以外の選択肢として、Tabbycat の power pairing に近いドロー生成（ブラケット/pull-up/衝突回避）を実装可能にする
  - 実装内容（MVP）:
    - `team_allocation_algorithm=powerpair` を追加（既存 `standard/strict` と並列）
    - ブラケット: `compiled_team_results.win` を points としてグルーピング（同点内の並びは現行 `teamComparer`）
    - odd bracket 解消: `pullup_top|pullup_bottom|pullup_random`（`intermediate` は後続）
    - ペアリング: `slide|fold|random`
    - 衝突回避: `one_up_one_down` swap（同校/過去対戦/任意属性 を対象。graph は後続）
    - サイド割当: 既存 `decidePositions` を使用（必要なら Tabbycat の side allocation を別途検討）
    - 生成メタ情報（bracket/pullup 等）を `Draw.userDefinedData` に付与（デバッグ用）
    - 制約（MVP）: `style.team_num=2` かつ配置対象チーム数が偶数（swing/bye は後続）
    - 参考メモ: `docs/research/tabbycat-team-draw.md`
  - 変更候補:
    - `packages/core/src/allocations/teams.ts`
    - `packages/core/src/allocations/teams/powerpair.ts`（新規）
    - `packages/server/src/controllers/allocations.ts`
    - `packages/web/src/views/admin/round/AdminRoundAllocation.vue`
    - `packages/core/tests/allocations-teams-powerpair.test.ts`（新規）
    - `packages/server/test/integration.test.ts`

- [ ] **T24. ブレイクラウンド（アウトラウンド）基盤（参加者確定）**
  - 目的: 予選結果からブレイク参加チームを確定し、ブレイクラウンド運用を UI/データで再現可能にする
  - 実装内容（MVP）:
    - ブレイク設定を `Round.userDefinedData` に定義（例: `break: { enabled, source_rounds, size, cutoff_tie_policy, seeding }`）
    - 参照ラウンド（`source_rounds`）は round ごとに都度選択できる UI にする（= 予選のどこまでを参照するかを毎回決められる）
    - 「候補チーム一覧」を提示して admin が選べるようにする（順位/同点グループを見せて include/exclude）
    - 確定結果を `Round.userDefinedData.break.participants`（`[{ teamId, seed }]`）に保存し、互換のため `Team.details[r].available` も一括更新する
  - 変更候補:
    - `packages/web/src/views/admin/AdminTournamentHome.vue`（チームのラウンド別参加可否編集 UI）
    - `packages/web/src/views/admin/AdminTournamentRounds.vue`（Round 側にブレイク設定 UI を置く場合）
    - `packages/server/test/integration.test.ts`

- [ ] **T25. ブレイクラウンドのドロー自動生成（シードペアリング）**
  - 目的: ブレイク参加者（上位シード）から `1 vs N, 2 vs N-1 ...` の対戦表を生成し、既存の Allocation 画面で調整/公開できる状態にする
  - 実装内容（MVP）:
    - API: `POST /api/allocations/break`（`tournamentId`, `round`）で allocation を返す（`Round.userDefinedData.break` を参照）
    - 初手は Tabbycat を参考に「固定シード + 勝ち上がり」方式で実装する
      - `size` が `2^k` でない場合も、上位シードに bye を付与して成立させる（Tabbycat の partial break の考え方）
      - 以後ラウンドは「前ラウンドの勝者 + 事前の bye シード」から生成（ブランケット進行）
    - 制約（MVP）: `style.team_num=2` のみ対応（複数チーム形式のアウトラウンドは後続）
    - 参考メモ: `docs/research/tabbycat-team-draw.md`
    - UI: `AdminRoundAllocation` の「自動生成」にブレイクを追加（teams 生成のみ break エンドポイントへ分岐）
  - 変更候補:
    - `packages/core/src/allocations/teams.ts`（break/seeded アルゴリズムを core に入れる場合）
    - `packages/server/src/controllers/allocations.ts`
    - `packages/server/src/routes/allocations.ts`
    - `packages/web/src/views/admin/round/AdminRoundAllocation.vue`
    - `packages/core/tests/*`
    - `packages/server/test/integration.test.ts`

---

### Phase 6（低優先: 外部連携領域）

- [ ] **T16. コメントシート一括ダウンロード（R18）**
  - 目的: 収集済みのコメント（フィードバック/バロット）を一括で出力し、外部配布・アーカイブを容易にする
  - 実装内容（案）:
    - 出力形式: `CSV`（基本）+ 必要なら `ZIP(CSV群)`（ラウンド別/カテゴリ別）
    - 設置場所: `AdminTournamentCompiled`（レポート生成）に「一括DL」導線を置く（提出一覧にもショートカット可）
    - 証明書は対象外（`T17` 参照）

- [ ] **T17. 賞状/参加証明書（R19, R20）**
  - 判定: **実装しない**（外部文書基盤で対応）
  - 代替案: Tabから受賞者/参加者CSVを出力し、既存PowerPoint/GAS等へ連携

---

### 統合メモ（旧タスクの扱い）

- `T10`（引き分け許容）/ `T11`（重複正規化）/ `T13`（ランキング優先度）は、重複実装を避けるため `T19` に統合
- 実装時は `T19` を親タスクとして進捗管理し、必要ならサブタスク化して運用する

### 要望対応マップ

- 要望1（ランキング優先度）: `T18` / `T19`
- 要望2（引き分けポリシー）: `T18` / `T19`
- 要望3（重複正規化）: `T18` / `T19`
- 要望4（欠損時ポリシー）: `T18` / `T19` / `T22`
- 要望5（生成対象選択）: `T18` / `T21`
- 要望6（差分 + 色付き三角）: `T20` / `T21`
- 要望7（ブレイクラウンド）: `T24` / `T25`
- 要望8（コメントシート一括DL）: `T16`
- 要望9（Tabbycat power pairing）: `T26`

---

### 追加すべきテスト（実装時に追加）

#### 1) Core 単体テスト（`packages/core/tests/*`）

- 追加/拡張ファイル候補:
  - `packages/core/tests/results-compile-advanced.test.ts`（拡張）
  - `packages/core/tests/results-compile-options.test.ts`（新規）
  - `packages/core/tests/allocations-break-seeding.test.ts`（新規）
  - `packages/core/tests/allocations-teams-powerpair.test.ts`（新規）
- テスト観点:
  - `ranking_priority` の順序変更で順位が期待通りに変化する
  - 引き分け（決定: `0.5-0.5`）が勝敗点=winに反映される（小数を含む）
  - 引き分け不可のラウンドで「引き分けになる入力」が提出不可になる（UI/API）
  - `duplicate_normalization`（`latest/average/error` 等）で集計結果が安定する
  - best/poi 集計が `average` / `max` で分岐する
  - `missing_data_policy`（警告/除外/停止）ごとの出力件数・停止条件
  - オプション未指定時に現行結果と一致する（後方互換）
  - チーム配置（`T26`）:
    - points ブラケット分割が `compiled_team_results.win` に従う（`0.5` を含むケース）
    - odd bracket 解消（pull-up）が期待通りに動作する
    - `slide/fold/random` でペアリングが分岐する
    - `one_up_one_down` により同校/過去対戦の衝突が減る（または衝突がある場合にメタ情報が付く）
    - seed 指定で結果が再現可能（deterministic）
  - ブレイク（`T24` / `T25`）:
    - 上位 N 抽出が `compiled_team_results` の順位に従う
    - 同点境界（cutoff tie）時の `cutoff_tie_policy`（include_all/strict/manual）が期待通り
    - `size=8` で `1 vs 8, 2 vs 7 ...` のペアが生成される（`seeding`）
    - `size=24` 等の非 `2^k` でも bye が付与され、次ラウンドへ進む形で成立する
    - `style.team_num!==2` の場合に明示的に失敗する（MVP 制約）

#### 2) Server 統合テスト（`packages/server/test/integration.test.ts`）

- 追加対象:
  - `POST /api/compiled`（本体）
  - `POST /api/compiled/{teams|speakers|adjudicators}`（派生）
  - `POST /api/allocations/break`（新規）
- テスト観点:
  - `options` 拡張項目が受理され、`payload` または保存ドキュメントへ反映される
  - `source=submissions` と `source=raw` で同等データ時に整合が取れる
  - `include_labels` で未選択ラベルの結果が空/非生成になる
  - `diff_baseline=latest` と `diff_baseline=<compiledId>` の差分算出が正しい
  - `missing_data_policy=error` で明示的エラーとなり保存されない
  - 旧リクエスト（オプションなし）で既存挙動を維持する
  - チーム配置（`T26`）:
    - `POST /api/allocations/teams` で `team_allocation_algorithm=powerpair` が選べる
  - ブレイク（`T24` / `T25`）:
    - `POST /api/allocations/break` が `Round.userDefinedData.break.participants` を参照して allocation を返す
    - 参加者未確定/対象不足/`team_num!==2` 等が 4xx で明示エラーになる

#### 3) Web ストア/コンポーネントテスト（`packages/web/src/*`）

- 追加ファイル候補:
  - `packages/web/src/stores/compiled.test.ts`（新規）
  - `packages/web/src/views/admin/AdminTournamentCompiled.test.ts`（新規）
  - `packages/web/src/utils/diff-indicator.test.ts`（新規、必要なら）
  - `packages/web/src/views/admin/round/AdminRoundAllocation.test.ts`（新規、必要なら）
- テスト観点:
  - ストアが新オプションを正しい payload で `/compiled` に送る
  - オプション未指定時のデフォルト値が期待通り
  - 差分アイコン（上/下/変化なし）が値に応じて正しく出し分けされる
  - 差分凡例と説明テキストが表示される
  - ヘルプ（`?`）が hover と focus の両方で表示される
  - キーボード操作（Tab/Enter/Space）でオプションUIを操作できる
  - ブレイク（`T24` / `T25`）:
    - Allocation 画面からブレイク生成が実行でき、allocation が置き換わる
    - 失敗時に API エラーメッセージが表示される（制約違反やデータ不足）
  - コメントシート（`T16`）:
    - 一括DLボタンが表示され、ファイルがダウンロードできる（最低限: CSV）

#### 4) QA/回帰チェック（ドキュメント連携）

- 更新対象:
  - `docs/ui/ui-qa-checklist.md`
- 追加観点:
  - レポート生成画面で「提出確認→生成→差分確認」が完結する導線
  - アイコン色だけに依存せず、テキストでも差分意味を判別できる
  - モバイル幅でオプション説明と差分表示が崩れない
  - 公開結果側（閲覧権限）に不要な内部オプションが露出しない
  - ブレイク（`T24` / `T25`）:
    - ブレイク生成後、Allocation 画面の「未配置リスト」がブレイク対象のみに絞れている
    - ブレイク生成のエラー（参加者未確定/対象不足/形式非対応）が UI 上で理解できる文言になっている

#### 5) 負荷試験（`T07` 連携）

- テスト観点:
  - 提出集中時の `/api/submissions/*` と `/api/compiled` の応答時間
  - Rate Limit 調整後の成功率/429率
  - 100チーム超想定での集計時間の閾値確認

---

### 仕様決定（2026-02-12）

1. 引き分け（`T18` / `T19`）
   - 引き分け時の勝敗点: `0.5-0.5`
   - 引き分け可否: ラウンド設定で制御（デフォルト=可）
   - 引き分け判定: `winner_policy` としてレポート生成（コンパイル）時に指定できる
   - 引き分け不可のラウンドは「引き分けになる提出」を送信不可（UI + API）
2. ランキング優先順位（`T18` / `T19`）
   - プリセット: 現行維持
   - カスタム: 任意
3. 重複入力の正規化（`T18` / `T19`）
   - 重複のマージ方針を指定できる
   - best/poi 集計は `average` / `max` を指定できる
4. 属性（地域など）の付与単位（`T14` / `T15`）
   - 付与単位は **チーム**

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
