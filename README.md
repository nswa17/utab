# UTab - Tabulation System

モダンなディベート大会管理システム

## 特徴

- 🎯 **型安全**: TypeScript完全対応
- ⚡ **高速**: Vite + pnpmによる高速ビルド
- 🏗️ **モノレポ**: Turboによる効率的な管理
- 🧪 **テスト**: Vitestによるテスト基盤
- 🐳 **Docker**: 開発環境の簡単セットアップ

## 設計思想（Lightweight Tab）

UTab は「集計・配席・公開」を中心に、運営に必要な最小機能を高品質に揃えることを重視します。

- まず **コアロジック（配席/集計順位アルゴリズム）を変えない改善** を優先する
- メール送信や証明書生成など **運用コストが高い周辺業務は外部連携を基本** とし、UTab 側は CSV/JSON 出力を強化する

## ローカルHTTPS（mkcert）

ブラウザ警告なしで build 構成を HTTPS 検証できます。

1. `pnpm https:setup`
2. `pnpm docker:build:https:up`
3. `https://localhost:8443` にアクセス

停止は `pnpm docker:build:https:down`。

## Legacy(v1)からの主な変更点（v2）

- 3リポジトリ構成をモノレポ化（`packages/core|server|web`）。旧実装は `legacy/` に保管
- 全面 TypeScript 化（strict）とテスト基盤（Vitest）
- Node.js 20+ / MongoDB 8.0+ / Mongoose 8 系へ更新
- 開発基盤: pnpm workspaces + Turbo、ESLint + Prettier、Docker、CI（GitHub Actions）
- サーバー: 認証の刷新（MD5 → bcrypt）、アクセス制御・公開レスポンス制限・CSRF/CORS・レートリミットの導入
- フロント: Vue 3 + Vite、Vuex → Pinia、Element UI → Element Plus

> v2 は API を刷新しているため、v1 クライアントとの互換性はありません。

## 最新アップデート（2026-02-13）

### 集計/提出まわりの安定化（Phase 4フォロー）

- Ballot提出のバリデーションを強化
  - 非同点スコア時に `winnerId` を必須化
  - `teamAId === teamBId` を拒否
  - 片側のみスコア入力・非有限値スコアを拒否
  - `speakerIds` / `matter,manner` / `best,poi` の配列長不整合を拒否
  - `no_speaker_score` ラウンドでは低勝ち警告の誤検知を回避
- 重複Ballot正規化を修正
  - 重複判定キーを「round + 対戦 + 提出者(actor)」に変更し、複数ジャッジの独立票を誤マージしない
  - `merge_policy=average` で同一actorの重複票を正しく平均化し、衝突票で `0.5-0.5` が反映される経路を追加
- カスタム順位比較の同順位付けを修正
  - メトリクス同値時に同順位を維持（順位表示とcutoffロジックの整合性を改善）
- 管理画面のコンパイル実行条件を修正
  - ラウンド未選択（=全ラウンド）でも実行可能
- 回帰テストを追加
  - `packages/server/test/integration.test.ts`
  - `packages/web/src/utils/ballot.test.ts`

### Phase 5 着手（T08: 提出済みデータ編集）

- 提出編集 API を追加
  - 管理者向けに `PATCH /api/submissions/:id` を追加し、提出済み ballot/feedback の `round` と `payload` を更新可能に
  - 更新時も通常提出と同じバリデーション（勝者・スコア整合・配列長整合）を適用
- 管理画面の提出一覧で編集を追加
  - `AdminTournamentSubmissions` で対象提出を開き、`round` と payload JSON をインライン編集・保存
- バリデーションを追加強化
  - `speakerIdsA/B` の空要素（例: `''`, `'   '`）を作成・更新の両経路で拒否
- 回帰テストを拡張
  - `packages/server/test/integration.test.ts`
  - `packages/web/src/stores/submissions.test.ts`

### Phase 5 追加（T09: ジャッジ組み合わせのラウンド別インポート）

- ラウンド配席画面に「ジャッジ組み合わせ取込」を追加
  - `AdminRoundAllocation` で CSV/TSV の貼り付け・ファイル読込から一括反映
  - 反映モードは `replace`（置換）/`append`（追記）を選択可能
- 取込フォーマット（MVP）
  - `match,chairs,panels,trainees`（match は 1 始まり）
  - `gov,opp,chairs,panels,trainees`（チーム名/ID 指定）
- バリデーション
  - 存在しないチーム/ジャッジ、重複ロール指定、範囲外 match をエラー化
- 回帰テストを追加
  - `packages/web/src/utils/adjudicator-import.test.ts`

### Phase 5 追加（T12: 内容/表現の分離入力・修正）

- 参加者バロット入力で前回提出をプリフィル
  - 同一提出者・同一ラウンド・同一対戦の既存 ballot がある場合、`winner/comment/speakerIds/scores/matter/manner/best/poi` を読み込み
  - Matter/Manner 入力ラウンドでも再提出時の修正コストを削減
- 管理画面の提出編集を拡張
  - `AdminTournamentSubmissions` に ballot 用のフォーム編集（`フォーム` / `JSON` 切替）を追加
  - Matter/Manner 分離入力と合計スコア入力を切替可能
- 提出APIの整合性を強化
  - `matter/manner` はペアでの指定を必須化
  - `matter/manner` が指定された場合は `scores` をサーバー側で再計算して保存し、不整合データを防止
- 回帰テストを追加
  - `packages/server/test/integration.test.ts`

### Phase 5 追加（T14: conflict種別/優先度のモデル化）

- Institution 属性を一般化
  - `Institution` に `category`（種別）と `priority`（重み）を追加
  - 既存の所属機関データを保持したまま、任意属性（例: region/league）を同じモデルで扱えるように
- 配席ロジックに priority 重みを反映
  - draw 生成時に `institution_priority_map` を構築して core へ受け渡し
  - adjudicator の `by_institution` フィルタで、単純件数ではなく重み付き衝突スコアを比較可能に
- 管理画面の Institution 管理を拡張
  - `AdminTournamentHome` の作成/編集/CSV 取込で `category` と `priority` を入力可能に
  - 一覧にも `category / priority` を表示
- 回帰テストを追加
  - `packages/core/tests/allocations-adjudicators-filters.test.ts`
  - `packages/server/test/integration.test.ts`
  - `packages/web/src/stores/institutions.test.ts`

### Phase 5 追加（T15: auto allocation新要素）

- チーム配席の機関衝突を重み付き評価へ拡張
  - team filter `by_institution` が `institution_priority_map` を参照し、同一属性衝突を priority ベースで比較
  - 学校/地域などを同じ Institution モデルで管理しつつ、重みで回避強度を調整可能に
- strict チーム配席の衝突回避を実装
  - `avoid_conflict` で局所 swap を有効化し、`機関衝突 + 過去対戦再マッチ` の合計スコアが下がる方向へ調整
  - `conflict_weights`（`institution` / `past_opponent`）と `max_swap_iterations` を追加
- 管理画面の strict オプションを拡張
  - `AdminRoundAllocation` に「機関衝突重み」「過去対戦重み」を追加
  - strict 生成時に上記重みを API オプションとして送信
- 回帰テストを追加
  - `packages/core/tests/allocations-teams.test.ts`
  - `packages/core/tests/allocations-teams-strict.test.ts`

### Phase 5 追加（T24: ブレイクラウンド基盤）

- ブレイク設定の API/UI を追加
  - `POST /api/rounds/:id/break/candidates`: 参照ラウンドを指定して候補チームをプレビュー（順位/勝敗点/境界同点フラグ）
  - `PATCH /api/rounds/:id/break`: `Round.userDefinedData.break` を保存し、必要に応じて参加可否を同期
- Round 管理画面を拡張
  - `AdminTournamentRounds` にブレイク設定 UI（source=submissions/raw、参照ラウンド、size、cutoff tie、seeding）を追加
  - 候補一覧から include/exclude を選択し、確定参加者をシード付きで保存
- 互換データを同期
  - 保存時に `Team.details[r].available` をブレイク参加者ベースで一括更新し、既存配席導線と整合
- 回帰テストを追加
  - `packages/server/test/integration.test.ts`（候補取得・保存・availability 同期）

### Phase 5 追加（T25: ブレイクラウンドのドロー自動生成）

- ブレイク専用配席 API を追加
  - `POST /api/allocations/break` を追加し、`Round.userDefinedData.break` を参照して `1 vs N, 2 vs N-1 ...` のシード対戦を生成
  - partial break（`size` が `2^k` でないケース）では上位シードに bye を付与
  - 次ラウンドで participants 未指定時は、前ラウンド draw の break メタデータ（`matches` / `stage_byes`）と compiled 勝敗から勝ち上がりを自動導出
- 生成メタデータを保持
  - `userDefinedData.break` に `stage_participants` / `stage_byes` / `matches` / `derived_from_previous_round` / `previous_round` を保存
- 配席 UI を拡張
  - `AdminRoundAllocation` の自動生成に `ブレイク` を追加
  - break 生成時は teams スコープ固定で `POST /api/allocations/break` に分岐
- 保存互換の修正
  - `POST /api/draws` の入力スキーマで `allocation[].venue = null` を許容し、break 自動生成結果をそのまま保存可能化
- 回帰テストを追加
  - `packages/server/test/integration.test.ts`（bye付き初戦生成 + 次ラウンド勝ち上がり導出）

### Phase 5 追加（T26: Tabbycat-style power pairing）

- チーム配席アルゴリズムに `powerpair` を追加
  - `team_allocation_algorithm=powerpair` を `standard/strict` と並列で利用可能
  - `compiled_team_results.win` ベースのブラケット分割、odd bracket の `pullup_top/pullup_bottom/pullup_random` を実装
  - ペアリング方式 `slide/fold/random` と、隣接ペア swap の `one_up_one_down`（機関衝突+過去対戦重み）を実装
- 生成メタデータを保持
  - 生成時のブラケット/設定情報を `userDefinedData.powerpair` として返却
  - draw 保存時に `Draw.userDefinedData` へ永続化し、再表示時に allocation UI へ復元
- 安定化修正（T26フォロー）
  - draw/allocations の審判割当前チェックを「試合数」ではなく「`(chairs+panels+trainees) × 試合数`」で判定
  - 必要人数不足時は審判割当を安全にスキップし、500を返さないよう修正
- 回帰テストを追加/更新
  - `packages/core/tests/allocations-teams-powerpair.test.ts`
  - `packages/server/test/integration.test.ts`

### Phase 6 追加（T16: コメントシート一括ダウンロード）

- レポート生成画面にコメントシートCSV出力を追加
  - `AdminTournamentCompiled` の提出状況サマリーに `コメントシートCSV` ボタンを追加
  - ballot/feedback の `payload.comment` を抽出し、1ファイルの CSV として一括ダウンロード
- 出力項目（MVP）
  - `round / round_name / submission_type / submitted_entity / matchup / winner / adjudicator / score / role / comment / created_at / updated_at`
  - 空コメントは自動除外
- 実装をユーティリティ化
  - CSV整形を `packages/web/src/utils/comment-sheet.ts` に切り出し
  - `packages/web/src/utils/comment-sheet.test.ts` で変換・CSVエスケープを検証

### Phase 6 追加（T17: 賞状/参加証明書の外部連携）

- 方針を明確化
  - 証明書のHTML/PDF自動生成はUTab本体では実装しない（外部文書基盤で運用）
  - 代替として、外部生成に必要なデータをCSVで出力
- 追加したCSV出力
  - `受賞者CSV`: 現在表示中カテゴリの表彰枠（順位・対象名・指標）を出力
  - `参加者CSV`: team/speaker/adjudicator の名簿（所属・アクティブ状態）を出力
- 実装をユーティリティ化
  - `packages/web/src/utils/certificate-export.ts` にCSV整形を切り出し
  - `packages/web/src/utils/certificate-export.test.ts` で整形とエスケープを検証

### 管理者UI刷新 完了（T27〜T34）

- 管理導線を 3 区分に再編
  - `大会セットアップ` / `ラウンド運営` / `結果確定・レポート`
  - 旧URL（`/home` `/rounds` `/compiled`）は互換導線を維持
- 大会セットアップにラウンド作成/編集を統合
  - ラウンド作成/編集（番号・名称・種別）を setup 側に集約
  - `/operations/rounds` は既存ラウンドの上書き編集に集中
- ラウンド運営ハブを主導線化
  - 固定ステップ（提出確認 → 集計 → 次ラウンド対戦生成 → 公開）
  - `snapshotId` 必須参照 + 未提出/スナップショット不一致ガードで誤実行を抑止
- レポート画面を snapshot 中心に再定義
  - 表示 snapshot 選択・比較・出力を主軸化
  - `生結果データ` は例外モードとして分離し、表示中 snapshot に応じたバッジ表示を追加
- 再読み込み UI を統一
  - 原則「ページ主 Reload は 1 つ」に統一
  - 最終更新時刻表示と `aria-label` ルールを共通化

## ドキュメント

- [PLAN.md](PLAN.md): Tabアップデート計画（2026-02-13 時点で完了）
- [DEPLOYMENT.md](DEPLOYMENT.md): デプロイ手順
- [docs/README.md](docs/README.md): 設計資料・ロードマップへの入口
- [docs/ui/ui-map.md](docs/ui/ui-map.md): 現在のUI導線と画面マップ
- [docs/ui/ui-qa-checklist.md](docs/ui/ui-qa-checklist.md): UI回帰チェック観点

## 移行ガイド（v1 → v2）

### 破壊的変更

#### 認証

- **旧**: MD5（脆弱）
- **新**: bcrypt

既存ユーザーは再ログイン時に再ハッシュ化が必要です。

#### 実行環境

- Node.js: 20.11.0 以上
- MongoDB: 8.0 以上

### 移行手順

#### 1. データベースバックアップ

```bash
mongodump --uri="mongodb://localhost:27017/your-db" --out=./backup
```

#### 2. MongoDB アップグレード

```bash
docker-compose down
# docker-compose.yml の mongo:8.0 を利用
docker-compose up -d
```

#### 3. 新バージョン起動

```bash
pnpm install
pnpm build
pnpm -C packages/server start
```

#### 4. Phase 8 セキュリティ移行の実行（必須）

既存データに対して、以下を一括で移行します。

- `auth.access.required=true` かつパスワード未設定の大会を `required=false` に補正
- 旧形式 `auth.access.password` を `passwordHash` に変換し、平文パスワードを削除
- `User.tournaments` と `Tournament.createdBy` から `TournamentMember` をバックフィル

```bash
pnpm -C packages/server migrate-security-phase8
```

#### 5. スタイルの再seed（既存スタイルを更新したい場合）

既存の `Style` コレクションを一度削除してから seed し直します。
カスタムスタイルがある場合は上書きされるため、必要ならバックアップしてください。

```bash
pnpm -C packages/server reset-styles
```

### API互換性

v2 は API 仕様を刷新しています。v1 クライアントは互換性がありません。
既存クライアントは v2 API に合わせてエンドポイントとリクエスト形式を更新してください。

### アロケーションの補足

- **審判が不足している場合**: `/api/draws/generate` と `/api/allocations/adjudicators` は
  チームのドロー／アロケーションを返しつつ、審判配席のみスキップします。
  返却される `allocation` 内の `chairs` / `panels` / `trainees` は空配列になります。

## 必要環境

- Node.js: 20.11.0 以上（`.nvmrc` 参照）
- pnpm: 8.0.0 以上（推奨: `pnpm@10`）
- MongoDB: 8.0 以上

## クイックスタート

```bash
corepack enable
pnpm install
```

### 開発

```bash
# サーバー
pnpm -C packages/server dev

# Web
pnpm -C packages/web dev
```

### 管理者UI移行フラグ（Web）

`.env` で以下を切り替えられます。

- `VITE_ADMIN_UI_V2=true|false`
  - `true`: 新導線（`/setup` `/operations` `/reports`）を主導線化
  - `false`: 旧導線（`/home` `/rounds` `/compiled`）を主導線化
- `VITE_ADMIN_UI_LEGACY_READONLY=true|false`
  - `true`: 旧主導線を読み取り専用表示にし、新導線への移行を促す

### デバッグログ

デバッグ時だけログを保存したい場合は `pnpm debug:server` を使うと
`.codex/logs/debug-*.log` に実行ログが保存されます。

任意のコマンドを記録したい場合は `pnpm debug -- <command> [args...]` を使ってください。

### Docker

```bash
docker-compose up --build
```

Web: http://localhost:8080  
API: http://localhost:3000/api/health

## パッケージ構成

- `@utab/core`: コアロジック（アルゴリズム、DB）
- `@utab/server`: Express APIサーバー
- `@utab/web`: Vue 3フロントエンド

## 技術スタック

- TypeScript 5.4+
- Node.js 20+
- MongoDB 8.0+
- Vue 3 + Vite
- Mongoose 8
- Express 4
