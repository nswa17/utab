# UTab - Tabulation System

モダンなディベート大会管理システム

## 特徴

- 🎯 **型安全**: TypeScript完全対応
- ⚡ **高速**: Vite + pnpmによる高速ビルド
- 🏗️ **モノレポ**: Turboによる効率的な管理
- 🧪 **テスト**: Vitestによるテスト基盤
- 🐳 **Docker**: 開発環境の簡単セットアップ

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
