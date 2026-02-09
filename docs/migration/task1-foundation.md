# Task 1: プロジェクト構成の設計と準備

このドキュメントはモノレポ移行の前提となる技術選定とディレクトリ構造の指針をまとめる。

## 技術選定

- パッケージマネージャー: pnpm 8.x (高速・厳格な依存解決、workspaces対応)
- モノレポビルド: Turbo (キャッシュ・並列実行)
- バージョン管理: 統一バージョン運用、将来的に Changesets 導入を検討（多パッケージ公開時）
- Node.js ベースライン: 20.11 LTS 以上
- リンター/フォーマッター: ESLint + Prettier（詳細設定は Task 2 以降で追加）

## ルートディレクトリ構造（計画）

```
utab/
├── .github/workflows/        # CI/CD (ci.yml, deploy.yml)
├── packages/
│   ├── core/                # @utab/core コアロジック
│   ├── server/              # @utab/server API
│   └── web/                 # @utab/web フロントエンド
├── docker/                  # Dockerfile.server, Dockerfile.web, nginx.conf
├── scripts/                 # setup.sh, migrate-db.ts など
├── config/                  # 共通設定（必要に応じて）
├── docs/                    # 本ドキュメントほか設計資料
├── package.json             # ルート設定 (pnpm workspace)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── turbo.json
├── .editorconfig
├── .eslintrc.js
├── .prettierrc
├── .gitignore
├── README.md
└── MIGRATION_PLAN.md
```

## メモ

- 既存リポジトリ（utab-core / utab-server / utab-view-future）は `packages/` 配下へ段階的に移行する。
- CI/CD は GitHub Actions を前提にし、Node 20 と pnpm をベースラインとする。
