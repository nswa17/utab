# 目標アーキテクチャ (UTab v2)

## 🎯 ディレクトリ構造

```
utab/
├── .github/
│   └── workflows/
│       ├── ci.yml           # CI/CDパイプライン
│       └── deploy.yml
├── packages/
│   ├── core/                # utab-core → @utab/core
│   │   ├── src/
│   │   │   ├── allocations/ # allocations.*
│   │   │   ├── controllers/ # controllers.*
│   │   │   ├── results/     # results.*
│   │   │   ├── general/     # general.* (logger, errors, math)
│   │   │   └── index.ts
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── server/              # utab-server → @utab/server
│   │   ├── src/
│   │   │   ├── app.ts       # Express app
│   │   │   ├── server.ts    # サーバーエントリーポイント
│   │   │   ├── config/      # 設定 (env, db)
│   │   │   ├── middleware/  # ミドルウェア (auth, error, logging)
│   │   │   ├── routes/      # ルーティング
│   │   │   ├── controllers/ # コントローラー
│   │   │   ├── models/      # Mongooseモデル
│   │   │   ├── services/    # サービス層
│   │   │   └── types/
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                 # utab-view-future → @utab/web
│       ├── src/
│       │   ├── main.ts
│       │   ├── App.vue
│       │   ├── router/
│       │   ├── stores/      # Piniaストア
│       │   ├── views/       # ページコンポーネント
│       │   ├── components/  # 共通コンポーネント
│       │   ├── composables/ # Composables
│       │   ├── utils/
│       │   └── types/
│       ├── public/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── env.d.ts
├── docker/
├── scripts/
├── package.json             # ワークスペースルート
├── pnpm-workspace.yaml
├── tsconfig.base.json       # 共通TypeScript設定
├── turbo.json               # Turboビルド設定
└── README.md
```

## 🛠 技術スタック

| カテゴリ                   | 現在              | 移行後                     |
| -------------------------- | ----------------- | -------------------------- |
| **言語**                   | JavaScript (ES6)  | TypeScript 5.3+            |
| **Node.js**                | 8.9.1             | 20.11.0 LTS以上            |
| **MongoDB**                | 3.6.3             | 7.0+                       |
| **Mongoose**               | 4.6.8 / 5.10.15   | 8.1.0+                     |
| **パッケージマネージャー** | npm               | pnpm (高速・効率的)        |
| **モノレポツール**         | なし              | pnpm workspaces + Turbo    |
| **フロントエンド**         | Vue 2 + Webpack 2 | Vue 3 + Vite 5             |
| **UIライブラリ**           | Element UI 2      | Element Plus               |
| **状態管理**               | Vuex 2            | Pinia                      |
| **テスト**                 | 限定的            | Vitest + Testing Library   |
| **ロガー**                 | Winston 2         | Pino                       |
| **バリデーション**         | なし              | Zod                        |
| **ORM**                    | 生Mongoose        | Mongoose + TypeScript定義  |
| **ビルド**                 | Babel + Webpack   | TypeScript Compiler + Vite |
| **リンター**               | なし              | ESLint + Prettier          |
| **CI/CD**                  | なし              | GitHub Actions             |
