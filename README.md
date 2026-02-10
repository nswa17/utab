# UTab - Debate Tabulation System

UTab は、ディベート大会運営のためのタブシステムです。
大会設定、ラウンド運用、提出回収、集計・結果表示までを一体で扱います。

## できること

- 大会/ラウンド/参加者（Team, Speaker, Adjudicator, Venue など）の管理
- ドロー/アロケーション運用
- 参加者向けバロット・フィードバック提出
- 管理者向け集計、結果確認、CSV 出力
- 大会アクセス制御、監査ログなどの運用向け機能

## 必要環境

- Node.js: 20.11.0 以上（`.nvmrc` 参照）
- pnpm: 8 以上（推奨: `pnpm@10`）
- MongoDB: 8.0 以上

## 起動方法

### 1. セットアップ

```bash
corepack enable
pnpm install
```

### 2. 開発起動

```bash
# API サーバー
pnpm -C packages/server dev

# Web
pnpm -C packages/web dev
```

### 3. Docker 起動

```bash
docker-compose up --build
```

- Web: [http://localhost:8080](http://localhost:8080)
- API Health: [http://localhost:3000/api/health](http://localhost:3000/api/health)

## legacy からの主な変更点

- 構成: 複数レポジトリ運用から、`pnpm workspace + turbo` のモノレポへ統合
- サーバー基盤: Node.js 8 系から 20 系へ更新
- フロントエンド: Vue 2 + Webpack 2 から Vue 3 + Vite へ移行
- 型安全性: JavaScript 中心から TypeScript 中心へ移行
- 認証: 旧 MD5 ベースから bcrypt ベースへ更新
- セキュリティ: 大会アクセス制御、公開レスポンス制限、監査ログ、レート制御を追加
- API: v2 で API 仕様を刷新（v1 クライアントとは非互換）
- 既存データ移行: `pnpm -C packages/server migrate-security-phase8` の実行が必要

## ドキュメント

- 変更方針の要約: [`ROADMAP.md`](ROADMAP.md)
- 実行チェックリスト: [`PLAN.md`](PLAN.md)
- 移行手順（v1 -> v2）: [`MIGRATION.md`](MIGRATION.md)
- デプロイ手順: [`DEPLOYMENT.md`](DEPLOYMENT.md)

## パッケージ構成

- `@utab/core`: コアロジック（配席・集計など）
- `@utab/server`: Express API
- `@utab/web`: Vue 3 フロントエンド
