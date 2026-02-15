# UTab Plan

最終更新: 2026-02-15

## 今やること（全体）

- [x] `legacy/` は現状維持（本フェーズでは変更しない）
- [x] ステージング→本番のデプロイ手順を確定（`DEPLOYMENT.md`）
- [x] UI モダン化計画を `PLAN.md` に集約し、未完了だった `T24` の「手動 seed 確定」導線を実装

---

## テスト実行の問題整理（2026-02-15）

### 問題

- `pnpm -C packages/web test` が無出力のまま停止し、完走しないケースがある
- `pnpm -C packages/web typecheck` / `typecheck:vue` も同様に停止するケースがある
- `pnpm -C packages/server exec tsc -p tsconfig.json --noEmit` も同様に停止するケースがある
- `pnpm -C packages/server lint`（対象ファイル限定実行を含む）も停止するケースがある
- 既存コマンドが長時間ブロックすると、CI/ローカルの「壊れているのか遅いだけか」の切り分けができない

### わかっていること

- Web 側に「負荷試験専用」の明示的なテストスイートは見当たらない（静的文字列検証中心のテストが多数）
- Typecheck 側は `tsconfig.lint.json` / `tsconfig.typecheck.json` でテストファイル除外済みであり、単純な対象過多だけが原因とは断定できない
- 実行環境依存で `vitest` / `tsc` プロセスがハングしている可能性が高い
- 2026-02-15 時点で `web test`/`web typecheck`/`web typecheck:vue` は timeout wrapper により `124` で終了することを確認（無限待機は回避）
- 暫定対策として `packages/web/scripts/run-with-timeout.mjs` を追加し、以下をデフォルト短時間実行へ変更済み
  - `pnpm -C packages/web test`（120秒 timeout）
  - `pnpm -C packages/web typecheck`（90秒 timeout）
  - `pnpm -C packages/web typecheck:vue`（120秒 timeout）
- 差分中心実行として `pnpm test:changed`（`scripts/test-changed.mjs`）を追加し、変更ファイルに対して package単位で `vitest related` を実行できるようにした
- `packages/server/test/integration.test.ts` は重いケースを `UTAB_FULL_CHECK=1` 時のみ実行する形に分離し、通常 `pnpm -C packages/server test` の待ち時間を削減した
- `packages/server/test/integration.test.ts` は通常実行時に MongoMemoryServer 起動を行わず、軽量テストのみDB非依存で実行するようにした
- フル実行コマンドは別名で維持済み
  - `test:full`
  - `typecheck:full`
  - `typecheck:vue:full`
- `test:full` は `UTAB_FULL_CHECK=1` を付与し、通常実行より長いテスト/フックタイムアウトを許可する

### 今後の方針

- 方針1: 開発時は「短時間で失敗を返す」デフォルトコマンドを維持し、フリーズ検知を優先する
- 方針2: リリース前/CI の最終確認は `*:full` を使う（長時間実行を明示的に選択）
- 方針2.1: フル確認が必要なときは `pnpm test:full` を使い、`UTAB_FULL_CHECK=1` を明示して slowテストを含める
- 方針3: `vitest` と `tsc` のハング再現条件を切り分ける（依存解決・Nodeバージョン・キャッシュ・ワーカー設定）
- 方針4: 負荷/長時間系テストを将来導入する場合は通常 `test` から分離し、`test:load` のような明示コマンドに隔離する
- 方針5: タイムアウト発生時は「コマンド・経過秒・再現条件」を `PLAN.md` と PR 説明に必ず記録する

### 追加で確認すべき重要ポイント

- `vitest` 実行時の worker 設定（`threads/pool`）とプロセス残留の有無
- `tsc` / `vue-tsc` の incremental キャッシュ破損有無（`node_modules/.cache/*`）
- `pnpm install` 後の lockfile 差分と依存解決揺れ
- CI 環境とローカル環境での再現差（同一 Node/PNPM バージョンで比較）

---

## Tab アップデート計画（完了）

### ステータス（2026-02-13）

- Phase 1〜6 と管理者UI刷新（`T27〜T34`）まで実装完了。
- `PLAN.md` 内のチェック項目はすべて完了済み（未完了チェックなし）。
- 次フェーズは新要件受付後に起票する（本計画はクローズ）。

### 方針（2026-02-12更新）

- レポート生成画面を中心に、集計オプション・差分確認・提出状況確認を一体化する
- 必要なコアロジック変更（ランキング比較・引き分け・正規化）は許容し、後方互換を維持して段階導入する
- ラウンド管理の提出関連機能は当面併設し、利用実績を見て主導線をレポート生成側へ寄せる
- 集計ソースは通常運用を `提出データ` に統一し、`生結果データ` は「例外補正レーン（高度な運用）」として扱う
- メール/証明書など運用コストが高いものは外部連携を基本とし、Tab側はデータ出力を強化する

### 進捗

- 2026-02-08: Phase 1 の `T01〜T06` を先行実装済み（詳細は `docs/migration/tab-update-roadmap-2026-02-08.md` を参照）
- 2026-02-12: `T18`（集計オプション拡張）と `T19`（集計ロジック統合）の MVP を実装し、Core/Server/Web の関連テストを追加・更新
- 2026-02-12: `T20`（差分表示基盤）`T21`（説明付きUI）`T22`（提出データ機能統合）の MVP を実装し、差分算出・凡例・ヘルプ・提出サマリをレポート生成画面へ統合
- 2026-02-12: `T23`（回帰観点の安定化）`T07`（レート制限の閾値調整）を実装し、公開compiledレスポンスの情報最小化・閾値の環境変数化・回帰テスト観点を反映
- 2026-02-13: `T23` フォローとして、提出/集計の安全性修正を反映（勝者必須条件、同一チーム拒否、配列長整合、非数値拒否、重複票average正規化、提出者単位の重複判定）し、Server/Web 回帰テストを拡張
- 2026-02-13: `T08` の MVP を実装（`PATCH /api/submissions/:id`、管理画面で提出済みデータの round/payload 編集、`speakerIds` 空要素拒否を含む検証と回帰テスト追加）
- 2026-02-13: `T09` の MVP を実装（ラウンド配席画面でジャッジ組み合わせ CSV/TSV 取込、match番号または gov/opp 指定で反映、replace/append 選択、取込パーサ/適用ロジックのユニットテスト追加）
- 2026-02-13: `T12` の MVP を実装（参加者バロット入力で前回提出内容のプリフィル、提出管理画面のフォーム編集に Matter/Manner 分離入力を追加、`matter/manner` から `scores` を再構成する API 正規化と回帰テスト追加）
- 2026-02-13: `T14` の MVP を実装（Institution に `category/priority` を追加して任意属性の衝突モデリングを一般化、配席時の機関衝突判定に priority 重みを反映、管理画面で category/priority を作成/編集可能化）
- 2026-02-13: `T15` の MVP を実装（team strict 配席で衝突最小化 swap を有効化、チーム機関衝突判定へ priority 重みを反映、strict UI から機関/過去対戦の衝突重みを調整可能化）
- 2026-02-13: `T26` の MVP を実装（`team_allocation_algorithm=powerpair` を追加、ブラケット+pull-up+pairing+one-up-one-down を実装し、生成メタを draw の `userDefinedData` へ保存）
- 2026-02-13: `T26` フォローとして、審判割当前チェックを `(chairs+panels+trainees) × 試合数` 基準へ修正し、必要人数不足時は安全に審判割当をスキップする挙動へ統一（`/api/draws/generate` と `/api/allocations/*`）
- 2026-02-13: `T24` の MVP を実装（Round 詳細にブレイク設定 UI を追加、参照ラウンド選択+候補プレビュー+手動選抜、`PATCH /api/rounds/:id/break` で `Round.userDefinedData.break` 保存と `Team.details[r].available` 同期を実装）
- 2026-02-13: `T25` の MVP を実装（`POST /api/allocations/break` を追加し、シード順 + bye 付きのブレイク配席と前ラウンド勝ち上がり自動導出を実装。`AdminRoundAllocation` にブレイク自動生成導線を追加し、保存互換のため draw 受け口を `venue: null` 許容へ拡張）
- 2026-02-13: `T16` の MVP を実装（`AdminTournamentCompiled` にコメントシート一括CSVダウンロードを追加。ballot/feedback の comment を1ファイルへ集約し、提出者・対戦・勝者・対象ジャッジ等を含めて出力）
- 2026-02-13: `T17` をクローズ（証明書機能は非実装方針を維持し、代替として `AdminTournamentCompiled` から受賞者CSV/参加者CSVを一括出力できるようにして外部文書基盤連携を明確化）
- 2026-02-13: `T24` フォローとして、ブレイク候補一覧に手動 seed 入力を追加。候補再取得時に manual の seed を保持し、重複/不正 seed は保存前に UI で検知するよう修正
- 2026-02-13: UI モダン化計画の運用先を `docs/ui/ui-modernization-plan.md` から `PLAN.md` に統合（詳細は本ファイルを正とする）
- 2026-02-13: 集計運用方針を更新し、通常運用を `提出データ` に一本化。`生結果データ` は例外補正レーンとして `T32/T34` で分離する方針を追加
- 2026-02-13: `T30` フォローとして、`/api/allocations/*`（break除く）に `snapshotId` 参照を必須化。ラウンド運営ハブ/配席画面で最新compiledのsnapshotを送る導線へ更新
- 2026-02-13: `T32` フォローとして、`AdminTournamentCompiled` に表示snapshot選択を追加し、`詳細再計算` 折りたたみパネルで再計算オプションを隔離
- 2026-02-13: `T33` 着手として、`admin UI v2` 機能フラグ（`VITE_ADMIN_UI_V2`）を追加。OFF時は旧URL（`/home` `/rounds` `/compiled`）を主導線にしつつ `新画面へ移動` 導線を実装
- 2026-02-13: `T33`/`T34` フォローとして、`source=raw` 運用時に `提出データ一本化ガイド` を表示し、`提出一覧`/`ラウンド運営` へ直接遷移できる移行導線を追加
- 2026-02-13: `T33` フォローとして、`VITE_ADMIN_UI_LEGACY_READONLY` を追加。旧主導線（`/home` `/rounds` `/compiled`）を読み取り専用表示に切り替え可能化
- 2026-02-13: `T28` フォローとして、`大会セットアップ` にラウンド作成（番号/名称/種別）を統合し、`/operations/rounds` は上書き編集中心の詳細設定画面へ整理
- 2026-02-13: `T34` フォローとして、compiled payload に `compile_source` を保存。結果画面は表示中 snapshot の source に基づいて `例外モード` バッジをヘッダー/差分凡例へ表示
- 2026-02-13: `T29` フォローとして、`/admin/:tournamentId/rounds/:round/result` ルートを復帰し、運営ハブから生結果画面へ遷移可能化
- 2026-02-13: `T33/T34` フォローとして、legacy read-only 表示の重複導線を整理し、運営ハブに「未提出/スナップショット不一致」ガードを追加（compile/generate の誤実行を抑止）

---

### 実行順サマリ（依存関係ベース）

1. 仕様確定（ブロッカー解消）
2. 集計基盤拡張（`T18`）
3. 集計ロジック統合（`T19`）
4. レポート生成UI統合（`T20` / `T21` / `T22`）
5. 段階リリースと負荷確認（`T23` / `T07`）
6. 周辺機能（`T08` / `T09` / `T12` / `T14` / `T15` / `T24` / `T25` / `T26`）
7. 外部連携領域の再評価（`T16` / `T17`）
8. 管理者UI刷新（`T27` / `T28` / `T29` / `T30` / `T31` / `T32` / `T33`）

---

### 管理者UI刷新 実行計画（期間なし）

- [x] **T27. 管理画面 IA 再編（大会セットアップ / ラウンド運営 / 結果確定）**
  - 目的: 画面責務を「準備」「運営」「確定」に分離し、運営導線の迷いを減らす
  - 実装内容:
    - 管理トップナビを `大会セットアップ` / `ラウンド運営` / `結果確定・レポート` に再編
    - 既存URLは互換リダイレクトを維持（ブックマーク破壊を防止）
    - `docs/ui/ui-map.md` の管理画面マップを新構成に更新
  - 変更候補:
    - `packages/web/src/router/index.ts`
    - `packages/web/src/views/admin/AdminTournament.vue`
    - `packages/web/src/views/admin/AdminTournamentHome.vue`
    - `docs/ui/ui-map.md`
  - 追加テスト:
    - `packages/web/src/router/admin-navigation.test.ts`（新規）
      - 新旧ルート遷移、権限制御、URL互換リダイレクト

- [x] **T28. 大会セットアップ統合（ラウンド作成 + デフォルト設定）**
  - 目的: 大会前に決める設定を1画面へ集約し、運営時の設定散在を解消する
  - 実装内容:
    - ラウンド作成/編集（番号・名称・種別）をセットアップ画面に集約
    - 提出/採点のデフォルト設定（`evaluate_from_*`, `evaluator_in_team`, `no_speaker_score`, `score_by_matter_manner`, `poi`, `best`）を大会単位で保存
    - ブレイク基本方針（size, tie policy, seeding, source）をテンプレートとして保持
  - 変更候補:
    - `packages/web/src/views/admin/AdminTournamentRounds.vue`
    - `packages/web/src/views/admin/AdminTournamentHome.vue`
    - `packages/web/src/stores/rounds.ts`
    - `packages/server/src/controllers/rounds.ts`
    - `packages/server/src/routes/rounds.ts`
  - 追加テスト:
    - `packages/web/src/views/admin/__tests__/AdminTournamentSetup.test.ts`（新規）
      - デフォルト保存、ラウンド新規作成時の継承、上書き編集
    - `packages/server/test/integration.test.ts`
      - デフォルト設定の保存・取得・ラウンド反映

- [x] **T29. ラウンド運営ハブ実装（提出確認→集計→対戦生成→公開）**
  - 目的: 次ラウンド作成を1フローで完結させ、画面横断の往復を減らす
  - 実装内容:
    - 左カラムにラウンド一覧（状態: 準備中/回収中/集計済み/生成済み/確定）
    - 中央に運営ステップを固定順で表示
      - 提出状況
      - 集計設定（プリセット + 詳細）
      - 標準プリセットは `提出データ` 固定（運営ハブ主導線）
      - 集計実行（明示）
      - 次ラウンド対戦生成
      - 公開/ロック
    - `生結果データ` は通常フローに置かず、必要時のみ開ける「高度な運用」導線へ隔離
    - ラウンドごとの上書き設定を同画面で管理
    - 既存詳細画面（Allocation/Submissions/Compiled）は「詳細を開く」として残す
  - 変更候補:
    - `packages/web/src/views/admin/AdminRoundOperationsHub.vue`（新規）
    - `packages/web/src/views/admin/round/AdminRoundAllocation.vue`
    - `packages/web/src/views/admin/AdminTournamentSubmissions.vue`
    - `packages/web/src/views/admin/AdminTournamentCompiled.vue`
    - `packages/web/src/stores/submissions.ts`
    - `packages/web/src/stores/compiled.ts`
  - 追加テスト:
    - `packages/web/src/views/admin/__tests__/AdminRoundOperationsHub.test.ts`（新規）
      - ステップ遷移条件、未提出警告、実行ガード
    - `packages/web/src/stores/round-operations.test.ts`（新規）
      - 集計実行と対戦生成の状態遷移

- [x] **T30. 集計スナップショット単一参照化（運営とレポートの整合）**
  - 目的: 「どの設定で作った集計か」を単一ソースにし、運営・最終結果の不整合を防止
  - 実装内容:
    - 集計実行結果に `snapshotId` を付与し、対戦生成時に参照必須化
    - 既存の暗黙集計（画面読み込み時 compile）を廃止し、明示実行へ統一
    - レポート画面は `snapshot` の選択/比較/出力を主軸化
  - 変更候補:
    - `packages/server/src/controllers/compiled.ts`
    - `packages/server/src/controllers/allocations.ts`
    - `packages/server/src/routes/allocations.ts`
    - `packages/web/src/stores/compiled.ts`
    - `packages/web/src/views/admin/round/AdminRoundAllocation.vue`
    - `packages/web/src/views/admin/AdminTournamentCompiled.vue`
  - 追加テスト:
    - `packages/server/test/integration.test.ts`
      - snapshot指定生成、他大会snapshot拒否、snapshot不変性
      - 暗黙集計廃止後の互換性、エラー時の復旧導線

- [x] **T31. 再読み込みUI統一（ReloadButton再設計）**
  - 目的: 散在する再読み込みボタンを整理し、更新責務を明確化する
  - 実装内容:
    - 「ページ主Reloadは1つ」を原則化（ページヘッダー右上）
    - セクションReloadは例外運用（独立データソース、重い再計算、権限差異がある場合のみ）
    - 同一データ範囲を更新する重複Reloadを削除
    - 最終更新時刻と `loading/disabled` を全画面で統一表示
    - 更新系操作（保存・作成・削除）成功時は対象セクションを自動再取得し、手動Reload依存を減らす
  - 変更候補:
    - `packages/web/src/components/common/ReloadButton.vue`
    - `packages/web/src/views/admin/AdminTournament.vue`
    - `packages/web/src/views/admin/AdminTournamentRounds.vue`
    - `packages/web/src/views/admin/round/AdminRoundAllocation.vue`
    - `packages/web/src/views/admin/AdminTournamentCompiled.vue`
    - `docs/ui/button-guidelines.md`
  - 追加テスト:
    - `packages/web/src/components/common/ReloadButton.test.ts`（新規）
      - loading/disabled/aria-label の挙動
    - `packages/web/src/views/admin/__tests__/admin-reload-behavior.test.ts`（新規）
      - ページ主ReloadとセクションReloadの表示条件

- [x] **T32. 結果確定・レポート画面の責務再定義**
  - 目的: 運営ロジック設定と最終出力設定を分離し、終了後運用を短時間化する
  - 実装内容:
    - 画面主役を「確定済みsnapshotの選択・比較・CSV/Slides/表彰出力」に変更
    - 再計算オプションは折りたたみの「詳細再計算」に隔離
    - 詳細再計算の既定ソースは `提出データ` とし、`生結果データ` は明示的な例外モードでのみ選択可能にする
    - 提出状況サマリは運営ハブへ主導線を移し、レポート側は参照中心
  - 変更候補:
    - `packages/web/src/views/admin/AdminTournamentCompiled.vue`
    - `packages/web/src/utils/comment-sheet.ts`
    - `packages/web/src/utils/certificate-export.ts`
    - `docs/ui/ui-qa-checklist.md`
  - 追加テスト:
    - `packages/web/src/views/admin/__tests__/AdminTournamentCompiledV2.test.ts`（新規）
      - snapshot比較、出力導線、再計算UIの折りたたみ制御

- [x] **T33. 移行・回帰・段階切替**
  - 目的: 既存大会運用を止めずに新導線へ移行する
  - 実装内容:
    - 機能フラグで `admin UI v2` を段階有効化
    - 旧導線に「新画面へ移動」導線を追加し、利用率を観測
    - 旧運用で `生結果データ` を主導線利用している大会向けに、移行時ガイド（提出データ一本化手順）を追加
    - 一定条件で旧導線を read-only 化し、最終的に置換
  - 変更候補:
    - `packages/web/src/views/admin/*`
    - `packages/server/src/config/environment.ts`
    - `docs/ui/ui-map.md`
    - `docs/ui/ui-qa-checklist.md`
  - 追加テスト:
    - `packages/web/src/router/admin-navigation.test.ts`
      - 機能フラグ ON/OFF の遷移確認
    - `packages/server/test/integration.test.ts`
      - 旧導線API互換と新導線APIの並行運用

- [x] **T34. 集計ソース導線整理（提出データ既定 + 生結果は例外）**
  - 目的: 「どちらで集計するか」の迷いを減らし、運営ミスを予防する
  - 実装内容:
    - `AdminTournamentCompiled` の主導線は `提出データ` 固定とする
    - `生結果データ` は「高度な運用」折りたたみ内でのみ選択可能にする
    - 例外モード実行時は、結果一覧ヘッダーと差分凡例に「例外モード」表示を出す
    - `source=raw` 実行時は確認ダイアログを挟み、意図しない誤操作を防止する
  - 変更候補:
    - `packages/web/src/views/admin/AdminTournamentCompiled.vue`
    - `packages/web/src/stores/compiled.ts`
    - `packages/web/src/i18n/messages.ts`
    - `docs/ui/ui-qa-checklist.md`
  - 追加テスト:
    - `packages/web/src/views/admin/__tests__/AdminTournamentCompiledV2.test.ts`（新規）
      - 既定ソース固定、例外モードの表示、確認ダイアログ経由実行

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
    - `PLAN.md`
    - `docs/ui/ui-qa-checklist.md`

- [x] **T07. 負荷試験と閾値調整（R21）**
  - 目的: 大規模大会で提出集中時の詰まりを防止
  - 変更候補:
    - `packages/server/src/middleware/rate-limit.ts`
    - `packages/server/src/app.ts`
    - `packages/server/src/config/environment.ts`
    - `docs/security-roadmap.md`（運用Runbook追記）

- [x] **T23-Followup. 提出/集計の安全性ハードニング（2026-02-13）**
  - 目的: Phase 2〜3 実装後のレビュー指摘を解消し、運用時の誤集計リスクを下げる
  - 実装内容:
    - Ballot/Feedback の入力検証を強化（非数値、同一チーム、片側スコア、配列長不整合）
    - 非同点スコアでの `winnerId` 必須化（UI/API）
    - `no_speaker_score` ラウンドでの低勝ち警告誤判定を解消
    - 重複票の判定キーを提出者(actor)単位へ修正
    - `merge_policy=average` の同一actor重複票を平均化で正規化
  - 変更ファイル:
    - `packages/server/src/routes/submissions.ts`
    - `packages/server/src/controllers/submissions.ts`
    - `packages/server/src/controllers/compiled.ts`
    - `packages/web/src/views/user/participant/round/ballot/UserRoundBallotEntry.vue`
    - `packages/web/src/utils/ballot.ts`
    - `packages/server/test/integration.test.ts`
    - `packages/web/src/utils/ballot.test.ts`

---

### Phase 5（中優先: 周辺機能）

- [x] **T08. 提出済みバロット編集（名前変更/追加）（R05）**
  - 目的: 入力ミスのリカバリを管理画面で完結
  - 実装メモ（MVP）:
    - 管理者 API `PATCH /api/submissions/:id` を追加（ballot/feedback を再検証して更新）
    - 管理画面 `AdminTournamentSubmissions` に提出データのインライン編集 UI（round + JSON）を追加
    - `speakerIds` の空要素を API で拒否し、更新経路でも同様にバリデーション
  - 変更候補:
    - `packages/server/src/controllers/submissions.ts`
    - `packages/server/src/routes/submissions.ts`
    - `packages/web/src/stores/submissions.ts`
    - `packages/web/src/views/admin/AdminTournamentSubmissions.vue`
    - `packages/server/test/integration.test.ts`

- [x] **T09. ジャッジ組み合わせインポート（ラウンド別）（R13）**
  - 目的: 当日手動作業を削減
  - 実装メモ（MVP）:
    - `AdminRoundAllocation` に「ジャッジ組み合わせ取込」モーダルを追加（CSV/TSV貼り付け + ファイル読込）
    - 取込フォーマットは `match,chairs,panels,trainees`（1始まり）と `gov,opp,chairs,panels,trainees`（チーム名/ID）をサポート
    - 反映モードは `replace` / `append` を選択可能
    - ジャッジ/チーム解決・重複ロール検証・行解決を `utils` に切り出し、ユニットテストを追加
  - 変更候補:
    - `packages/web/src/views/admin/round/AdminRoundAllocation.vue`
    - `packages/web/src/utils/adjudicator-import.ts`（新規）
    - `packages/web/src/utils/adjudicator-import.test.ts`（新規）

- [x] **T12. 内容/表現の分離入力・修正（R08）**
  - 目的: 採点軸を明示して後編集可能にする
  - 実装メモ（MVP）:
    - 参加者バロット入力で同一提出者・同一対戦の前回提出を読み込み、Matter/Manner を含む再編集を可能化
    - 管理画面 `AdminTournamentSubmissions` の提出編集に「フォーム編集」を追加（Matter/Manner 分離入力 + JSON 編集の切替）
    - サーバー側で `matter/manner` ペア必須バリデーションを追加し、両方がある場合は `scores` を自動再計算して整合性を維持
  - 変更ファイル:
    - `packages/web/src/views/user/participant/round/ballot/UserRoundBallotEntry.vue`
    - `packages/web/src/views/admin/AdminTournamentSubmissions.vue`
    - `packages/server/src/controllers/submissions.ts`
    - `packages/server/src/routes/submissions.ts`
    - `packages/server/test/integration.test.ts`

- [x] **T14. conflict種別/優先度のモデル化（R11）**
  - 目的: チーム/学校/任意属性（例: 地域）衝突を一元管理（「地域」ハードコードは避ける）
  - 実装メモ（MVP）:
    - `Institution` に `category`（属性種別）と `priority`（衝突重み）を追加
    - `AdminTournamentHome` の Institution 管理（手動追加/編集/CSV）で `category/priority` を操作可能化
    - adjudicator 配席の `by_institution` フィルタで、重複 institution 数ではなく `priority` 重み付きスコアを比較可能化
    - draw 生成時に `config.institution_priority_map` を構築して core フィルタへ連携
  - 変更ファイル:
    - `packages/server/src/models/institution.ts`
    - `packages/web/src/types/institution.ts`
    - `packages/web/src/views/admin/AdminTournamentHome.vue`
    - `packages/core/src/allocations/adjudicators/adjfilters.ts`
    - `packages/server/src/routes/institutions.ts`
    - `packages/server/src/controllers/institutions.ts`
    - `packages/server/src/controllers/draws.ts`
    - `packages/core/tests/allocations-adjudicators-filters.test.ts`
    - `packages/web/src/stores/institutions.ts`
    - `packages/web/src/stores/institutions.test.ts`
    - `packages/server/test/integration.test.ts`

- [x] **T15. auto allocation新要素（R16）**
  - 目的: 同校複数チームや「任意属性（例: 地域）」偏りの最適化（地域ハードコードは避ける）
  - 実装メモ（MVP）:
    - `by_institution`（team filter）で `config.institution_priority_map` による重み付き衝突比較を導入
    - strict 配席の `avoid_conflict` を実装し、局所 swap で「機関衝突 + 過去対戦再マッチ」の合計スコアを削減
    - strict 配席オプションに `conflict_weights`（`institution` / `past_opponent`）と `max_swap_iterations` を追加
    - `AdminRoundAllocation` から strict 衝突重みを入力できる UI を追加
    - allocations API 側でも institution priority map を config に注入して、手動再生成経路でも同じ評価軸を適用
  - 変更ファイル:
    - `packages/core/src/allocations/teams/filters.ts`
    - `packages/core/src/allocations/teams/strict_matchings.ts`
    - `packages/core/src/allocations/teams.ts`
    - `packages/core/src/index.ts`
    - `packages/server/src/controllers/allocations.ts`
    - `packages/web/src/views/admin/round/AdminRoundAllocation.vue`
    - `packages/core/tests/allocations-teams.test.ts`
    - `packages/core/tests/allocations-teams-strict.test.ts`

- [x] **T26. チームドロー: Tabbycat-style power pairing アルゴリズム（R16拡張）**
  - 目的: Gale–Shapley ベース以外の選択肢として、Tabbycat の power pairing に近いドロー生成（ブラケット/pull-up/衝突回避）を実装可能にする
  - 実装メモ（MVP）:
    - `team_allocation_algorithm=powerpair` を追加（既存 `standard/strict` と並列）
    - ブラケット: `compiled_team_results.win` を points としてグルーピング（同点内の並びは現行 `teamComparer`）
    - odd bracket 解消: `pullup_top|pullup_bottom|pullup_random`
    - ペアリング: `slide|fold|random`
    - 衝突回避: `one_up_one_down` swap（隣接ペア間スワップ）を実装し、機関衝突 + 過去対戦再マッチを低減
    - サイド割当: 既存 `decidePositions` を利用
    - 生成メタ（brackets/pullups/settings）を `userDefinedData.powerpair` として返却・保存
    - 制約（MVP）: `style.team_num=2` かつ配置対象チーム数が偶数
    - 参考メモ: `docs/research/tabbycat-team-draw.md`
  - 変更ファイル:
    - `packages/core/src/allocations/teams.ts`
    - `packages/core/src/allocations/teams/powerpair.ts`（新規）
    - `packages/core/src/index.ts`
    - `packages/core/src/allocations/teams/filters.ts`
    - `packages/server/src/controllers/allocations.ts`
    - `packages/server/src/controllers/draws.ts`
    - `packages/server/src/models/draw.ts`
    - `packages/server/src/routes/draws.ts`
    - `packages/web/src/views/admin/round/AdminRoundAllocation.vue`
    - `packages/web/src/types/draw.ts`
    - `packages/web/src/stores/draws.ts`
    - `packages/web/src/i18n/messages.ts`
    - `packages/core/tests/allocations-teams-powerpair.test.ts`（新規）
    - `packages/server/test/integration.test.ts`

- [x] **T24. ブレイクラウンド（アウトラウンド）基盤（参加者確定）**
  - 目的: 予選結果からブレイク参加チームを確定し、ブレイクラウンド運用を UI/データで再現可能にする
  - 実装メモ（MVP）:
    - Round API を拡張
      - `POST /api/rounds/:id/break/candidates`（参照ラウンド + source 指定で候補チームをプレビュー）
      - `PATCH /api/rounds/:id/break`（`Round.userDefinedData.break` 保存 + 必要に応じて Team availability 同期）
    - 候補抽出は compiled ロジック（保存なし）を再利用し、順位/勝敗点/同点境界フラグを返却
    - 管理画面 `AdminTournamentRounds` のラウンド詳細にブレイク設定 UI を追加
      - 参照 source（submissions/raw）、参照ラウンド、size、cutoff tie 方針、seeding
      - 候補一覧（include/exclude）と手動 seed 確定
    - 互換のため、保存時に `Team.details[r].available` をブレイク参加者に同期
  - 変更ファイル:
    - `packages/server/src/controllers/compiled.ts`
    - `packages/server/src/controllers/rounds.ts`
    - `packages/server/src/routes/rounds.ts`
    - `packages/web/src/types/round.ts`
    - `packages/web/src/stores/rounds.ts`
    - `packages/web/src/views/admin/AdminTournamentRounds.vue`
    - `packages/web/src/i18n/messages.ts`
    - `packages/server/test/integration.test.ts`

- [x] **T25. ブレイクラウンドのドロー自動生成（シードペアリング）**
  - 目的: ブレイク参加者（上位シード）から `1 vs N, 2 vs N-1 ...` の対戦表を生成し、既存の Allocation 画面で調整/公開できる状態にする
  - 実装内容（MVP）:
    - API `POST /api/allocations/break` を追加（`tournamentId`, `round`）
      - `Round.userDefinedData.break.participants` を参照し、`1 vs N, 2 vs N-1 ...` で対戦カードを生成
      - `size` が `2^k` でない場合は上位シードに bye を付与してラウンド成立
      - 次ラウンドで participants 未設定時は、前ラウンド draw の break メタデータ（`matches`/`stage_byes`）+ compiled 勝敗から勝ち上がりを自動導出
    - 生成結果の `userDefinedData.break` に `stage_participants` / `stage_byes` / `matches` / `derived_from_previous_round` を格納
    - UI `AdminRoundAllocation` の自動生成に `ブレイク` を追加し、teams スコープ時のみ `POST /api/allocations/break` へ分岐
    - 保存互換: `POST /api/draws` の入力スキーマで `allocation[].venue = null` を許容（break 生成結果の即保存を可能化）
    - 制約（MVP）: `style.team_num=2` のみ対応
    - 参考メモ: `docs/research/tabbycat-team-draw.md`
  - 変更ファイル:
    - `packages/server/src/controllers/allocations.ts`
    - `packages/server/src/routes/allocations.ts`
    - `packages/server/src/routes/draws.ts`
    - `packages/web/src/views/admin/round/AdminRoundAllocation.vue`
    - `packages/web/src/i18n/messages.ts`
    - `packages/server/test/integration.test.ts`

---

### Phase 6（低優先: 外部連携領域）

- [x] **T16. コメントシート一括ダウンロード（R18）**
  - 目的: 収集済みのコメント（フィードバック/バロット）を一括で出力し、外部配布・アーカイブを容易にする
  - 実装内容（MVP）:
    - 設置場所: `AdminTournamentCompiled`（レポート生成）に `コメントシートCSV` ボタンを追加
    - 出力形式: 単一 `CSV`（UTF-8 with BOM）
      - ballot/feedback の `payload.comment` を対象に、空コメントは除外
      - 列: round/round_name/type/submitted_entity/matchup/winner/adjudicator/score/role/comment/timestamp
    - CSV生成ロジックを `packages/web/src/utils/comment-sheet.ts` に分離し、ユニットテストを追加
    - 証明書は対象外（`T17` 参照）
  - 変更ファイル:
    - `packages/web/src/views/admin/AdminTournamentCompiled.vue`
    - `packages/web/src/utils/comment-sheet.ts`（新規）
    - `packages/web/src/utils/comment-sheet.test.ts`（新規）
    - `packages/web/src/i18n/messages.ts`

- [x] **T17. 賞状/参加証明書（R19, R20）**
  - 判定: **証明書機能本体は実装しない**（外部文書基盤で対応）
  - 代替実装:
    - `AdminTournamentCompiled` に `受賞者CSV` / `参加者CSV` を追加
    - 受賞者CSV: 現在表示中カテゴリの表彰枠（順位/対象/指標）を外部文書向けに出力
    - 参加者CSV: team/speaker/adjudicator の名簿（所属・稼働フラグ含む）を出力
  - 変更ファイル:
    - `packages/web/src/views/admin/AdminTournamentCompiled.vue`
    - `packages/web/src/utils/certificate-export.ts`（新規）
    - `packages/web/src/utils/certificate-export.test.ts`（新規）
    - `packages/web/src/i18n/messages.ts`

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
  - `packages/core/tests/results-checks.test.ts`（拡張）
  - `packages/core/tests/allocations-teams.test.ts`（拡張）
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
  - `packages/web/src/views/admin/__tests__/AdminTournamentCompiledV2.test.ts`（新規）
  - `packages/web/src/utils/diff-indicator.test.ts`（新規、必要なら）
  - `packages/web/src/views/admin/__tests__/AdminRoundOperationsHub.test.ts`（新規）
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

- 新規UI追加・既存UI変更時は、`docs/ui/button-guidelines.md` の運用ルールに沿ってボタン種別を選ぶ
- タブ/表示切替は「実行ボタン」ではなくセグメントUIとして実装する
- 再読み込み操作は「ページ主Reloadを1つ + 例外的なセクションReloadのみ」を原則にする
- 1つのカード/モーダル内で `primary` を複数並べない（主操作は原則1つ）
- 破壊的操作のみ `danger` を使い、戻る/閉じる/補助操作は `ghost` または `secondary` を使う
- PR前に以下を必須実行する
  - `pnpm --filter @utab/web typecheck`
  - `pnpm --filter @utab/web test`
- UI関連変更を入れたPRでは、影響画面を `docs/ui/ui-map.md` に追記・更新する
- 文言追加・変更時は `docs/ui/ui-i18n-guidelines.md` の用語方針（Draw/Ballot/Adjudicator）と英語デフォルト方針を確認する

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
- セグメントUIには `aria-label` と `aria-pressed`（または `role="tablist"`/`role="tab"`）を付与し、キーボード操作時も状態が判別できるようにする。

4. 再読み込み（Reload）の原則
- 同一ページで同じデータ境界を再取得する Reload は1つに統一する（原則: ページヘッダー右上）。
- セクション単位の Reload は例外であり、以下を満たす場合のみ置く:
  - データソースが独立している
  - 再取得コストが高く、部分更新の価値が明確
  - セクションごとに権限差異または失敗復旧が必要
- 更新系操作（保存/作成/削除）後は対象セクションを自動再取得し、手動Reloadを主導線にしない。
- Reload は常に `secondary` 扱いとし、`primary` にしない。
- Reload ボタンの近傍には最終更新時刻を表示し、「何が最新化されるか」を明示する。
- `loading` 中は再クリック不可にし、`aria-label` で更新対象を明示する。

5. 視覚トークンの原則
- 色・余白・角丸は既存トークン（`packages/web/src/styles.css`）を優先し、個別色の直書きを増やさない。
- 新しいUIパーツは既存コンポーネント（`Button`, `Field`, `Table`, `ReloadButton`）を再利用する。
- 単発の例外スタイルを追加した場合は、後続で共通化できるかを必ず検討する。

6. 実装時チェック（Definition of Done）
- 新規/変更UIが `docs/ui/button-guidelines.md` と矛盾しない。
- active/inactive/hover/disabled の状態差が視認可能で、意味づけが一貫している。
- 同一画面内で `primary` が複数存在しない。
- 同一カード/モーダル内では主操作を1つに絞り、サブセクションの保存は `secondary` で扱う。
- 同一データ境界に対する Reload が重複していない。
- 影響範囲を `docs/ui/ui-map.md` に追記済み。
- `pnpm --filter @utab/web typecheck` と `pnpm --filter @utab/web test` が通過している。

7. レビュー観点（UI崩れ防止）
- 「この操作は本当に `ghost` か？」を必ずレビューで確認する。
- 「これはタブか、実行ボタンか？」を分離して命名・見た目を決める。
- 「このReloadはどのデータ境界を更新するのか？」をレビューで明文化する。
- 既存画面との比較スクリーンショットで、色調と操作階層の不整合を確認する。

8. データソース導線の原則
- 同じ目的（公式順位の確定）に対して、日常運用の主導線は1本にする（既定: `提出データ`）。
- 例外レーン（`生結果データ`）は常設主導線に置かず、明示ラベル付きの高度運用導線として分離する。
- 例外レーンを使った場合は、画面上で「例外モードで再計算した」ことが判別できる表示を必須にする。
