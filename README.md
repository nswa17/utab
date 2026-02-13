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

## ドキュメント

- [PLAN.md](PLAN.md): 未完了のアップデート計画（次にやること）
- [DEPLOYMENT.md](DEPLOYMENT.md): デプロイ手順
- [docs/README.md](docs/README.md): 設計資料・ロードマップへの入口

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
