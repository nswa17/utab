# UTab - Tabulation System

モダンなディベート大会運営システム（`packages/core` + `packages/server` + `packages/web` のモノレポ）です。

## 現在の位置づけ

- v3 系（TypeScript モノレポ）が現行実装
- 旧実装（v2 系）は `legacy/` に保持
- API の正規エンドポイントは `/api/v1/*`（互換 `/api/*` は移行期間のみ。`Deprecation`/`Sunset`/`Link`/`Warning` ヘッダを返却）

## 主要機能

- 配席（チーム/審判/会場）と集計（compiled）
- 提出（ballot / feedback / raw-results）
- ブレイクラウンド設定と自動生成
- Tabbycat-style power pairing
- レポート向け CSV 出力（コメントシート・受賞者・参加者）
- 大会アクセス制御、公開レスポンス制限、監査ログ、レートリミット

## 必要環境

- Node.js: `>=20.11.0`（推奨: `.nvmrc` の `24`）
- pnpm: `>=8`（推奨: `10.x`）
- MongoDB: `8.0+`

## セットアップ

```bash
corepack enable
pnpm install
cp .env.example .env
```

`.env` の最低限設定:

- `MONGODB_URI`
- `SESSION_SECRET`（16文字以上）
- `CORS_ORIGIN`（例: `http://localhost:8080`）
- `VITE_API_URL`（ローカル開発は `/api/v1` 推奨。旧 `/api` も互換あり）

## 開発

```bash
# 全パッケージ並列起動（turbo）
pnpm dev

# 個別起動
pnpm dev:server
pnpm dev:web
```

- API health: `http://localhost:3000/api/v1/health`
- Web (Vite): `http://localhost:5173`

## テスト / チェック

```bash
# テスト（全パッケージ）
pnpm test

# パッケージ単位
pnpm -C packages/core test
pnpm -C packages/server test
pnpm -C packages/web test

# 型・ビルド系チェック
pnpm lint
pnpm lint:web

# 整形
pnpm format
```

サーバー統合テストは `packages/server/test/integration.part*.test.ts` に分割されています。

## Docker

```bash
docker compose up -d --build
```

- Web: `http://localhost:8080`
- API: `http://localhost:3000/api/health`

## データ移行 / style 更新

- 起動時にセキュリティ移行（大会アクセス設定補正、パスワードハッシュ化、`TournamentMember` バックフィル）を自動実行
- `PDA3` / `PDA4` の reply 表記を `GR` / `OR` から `PMR` / `LOR` に更新する場合は、既存 DB に対して次を一度だけ実行

```bash
pnpm -C packages/server migrate-style-pda-reply-labels
```

- built-in `Style` を完全に入れ直したい場合のみ、必要に応じて再 seed
- `reset-styles` は `styles` コレクションを全削除して再投入するため、カスタム style がある環境では使わないこと

```bash
pnpm -C packages/server reset-styles
```

## 主要ドキュメント

- [PLAN.md](PLAN.md): 実装計画と進捗
- [DEPLOYMENT.md](DEPLOYMENT.md): デプロイ手順
- [docs/README.md](docs/README.md): 技術ドキュメント索引
- [docs/architecture-v2.md](docs/architecture-v2.md): 現行アーキテクチャ概要
- [docs/security-roadmap.md](docs/security-roadmap.md): セキュリティ設計・実装履歴
- [docs/ui/ui-map.md](docs/ui/ui-map.md): UI 導線マップ
- [docs/ui/ui-qa-checklist.md](docs/ui/ui-qa-checklist.md): UI 回帰チェック
