# UTab モダン化・統合移行計画

## 🔐 セキュリティロードマップ進捗（2026-02-08）

- Phase 8（移行と回帰テスト）を実装済み。
- サーバー側に `packages/server/src/scripts/migrate-security-phase8.ts` を追加し、以下を自動移行:
  - パスワード未設定大会の `auth.access.required` 補正（`false`）
  - 旧平文 `auth.access.password` の `passwordHash` 化
  - `User.tournaments` / `Tournament.createdBy` から `TournamentMember` をバックフィル
- 実行コマンド: `pnpm -C packages/server migrate-security-phase8`
- 統合テストに Phase 8 回帰ケースを追加（移行結果と再実行時の冪等性を検証）。

## 📊 現状分析

### 🏗️ 現在のアーキテクチャ

#### utab-core（コアロジック）

- **言語**: JavaScript (ES6 with Babel)
- **Node.js**: 未指定（package.jsonには記載なし。utab-serverは8.9.1）
- **エントリポイント**: `utab.js`（`package.json`の`main`は`main.js`となっているが誤り）
- **主要機能**:
  - ディベート大会のドロー（対戦組み合わせ）アルゴリズム
  - チーム・ジャッジ・会場のアロケーション
  - 結果集計とランキング計算
  - Mongooseベースのデータベースハンドラー
- **依存パッケージ**:
  - mongoose: 4.6.8 → **重大な脆弱性あり**
  - babel-preset-es2015: 6.18.0 → **非推奨**
  - underscore: 1.8.3 → **古い**
  - winston: 2.3.0 → **古い**

#### utab-server（APIサーバー）

- **言語**: JavaScript (CommonJS)
- **Node.js**: 8.9.1（EOL: 2019年12月） → **サポート終了**
- **フレームワーク**: Express 4.16.2
- **主要機能**:
  - RESTful API提供
  - 認証・セッション管理
  - 大会データCRUD操作
  - マルチテナント対応（大会ごとのDB分離）
  - `lib/utab-core`にコアロジックをコピーして保持（二重管理）
- **依存パッケージ**:
  - mongodb: 3.6.3 → **古い**
  - mongoose: 5.10.15 → **古い**
  - express-session: 1.15.6
  - blueimp-md5: 2.10.0（セキュリティ懸念）
- **課題**:
  - `app.js`内にDB名（`heroku_zm (一部Flowの設定ファイルあり)37jwvt`等）やURLがハードコードされている

#### utab-view-future（フロントエンド）

- **言語**: JavaScript + Vue 2
- **Node.js**: >= 6（非常に古い）
- **フレームワーク**: Vue 2.5.2
- **ビルドツール**: Webpack 2.7.0
- **主要機能**:
  - 大会管理UI（管理者向け）
  - 投票・フィードバック入力（参加者向け）
  - リアルタイムドロー表示
  - 統計・グラフ表示（Highcharts）
- **依存パッケージ**:
  - element-ui: 2.0.5 → **Vue 2専用、Element Plusへ移行必要**
  - vue-router: 2.8.1 → **古い**
  - vuex: 2.5.0 → **古い**
  - webpack: 2.7.0 → **非常に古い**

### 🔍 主要な技術的問題点

1. **セキュリティリスク**
   - Node.js 8.9.1のサポート終了
   - MongoDB 3.x系の脆弱性
   - 古いmongooseバージョンの脆弱性
   - MD5ハッシュの使用（セキュリティ強度不足）

2. **保守性の問題**
   - JavaScriptのため型安全性がない
   - 3つの独立したリポジトリで依存関係管理が複雑
   - 古いビルドツールチェーン
   - テストカバレッジ不足

3. **開発体験の問題**
   - Webpack 2の遅いビルド速度
   - Vue 2の制限（Composition API未対応）
   - IDE補完の不足（型定義なし）

---

## 🎯 移行後の目標構成

### ディレクトリ構造

```
utab/
├── .github/
│   └── workflows/
│       ├── ci.yml           # CI/CDパイプライン
│       └── deploy.yml
├── packages/
│   ├── core/                # utab-core → @utab/core
│   │   ├── src/
│   │   │   ├── allocations/
│   │   │   │   ├── teams.ts
│   │   │   │   ├── adjudicators.ts
│   │   │   │   └── venues.ts
│   │   │   ├── controllers/
│   │   │   │   ├── handlers.ts
│   │   │   │   └── schemas.ts
│   │   │   ├── results/
│   │   │   │   └── checks.ts
│   │   │   ├── general/
│   │   │   │   ├── errors.ts
│   │   │   │   ├── logger.ts
│   │   │   │   ├── math.ts
│   │   │   │   └── tools.ts
│   │   │   └── index.ts
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── server/              # utab-server → @utab/server
│   │   ├── src/
│   │   │   ├── app.ts       # Express app
│   │   │   ├── server.ts    # サーバーエントリーポイント
│   │   │   ├── config/
│   │   │   │   ├── database.ts
│   │   │   │   └── environment.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── error.ts
│   │   │   │   └── logging.ts
│   │   │   ├── routes/
│   │   │   │   ├── tournaments.ts
│   │   │   │   ├── auth.ts
│   │   │   │   └── index.ts
│   │   │   ├── controllers/
│   │   │   │   ├── tournament.controller.ts
│   │   │   │   └── auth.controller.ts
│   │   │   ├── models/
│   │   │   │   ├── user.model.ts
│   │   │   │   ├── tournament.model.ts
│   │   │   │   └── style.model.ts
│   │   │   ├── services/
│   │   │   │   └── hash.service.ts
│   │   │   └── types/
│   │   │       └── express.d.ts
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                 # utab-view-future → @utab/web
│       ├── src/
│       │   ├── main.ts
│       │   ├── App.vue
│       │   ├── router/
│       │   │   └── index.ts
│       │   ├── stores/
│       │   │   ├── index.ts
│       │   │   ├── auth.ts
│       │   │   ├── tournament.ts
│       │   │   └── ballot.ts
│       │   ├── views/
│       │   │   ├── Login.vue
│       │   │   ├── admin/
│       │   │   └── user/
│       │   ├── components/
│       │   │   ├── common/
│       │   │   ├── slides/
│       │   │   └── stats/
│       │   ├── composables/
│       │   │   ├── useAuth.ts
│       │   │   └── useTournament.ts
│       │   ├── utils/
│       │   │   ├── math.ts
│       │   │   └── validator.ts
│       │   ├── types/
│       │   │   └── tournament.ts
│       │   └── assets/
│       ├── public/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── env.d.ts
├── docker/
│   ├── Dockerfile.server
│   ├── Dockerfile.web
│   └── nginx.conf
├── scripts/
│   ├── setup.sh
│   └── migrate-db.ts
├── .gitignore
├── .editorconfig
├── .prettierrc
├── .eslintrc.js
├── docker-compose.yml
├── package.json             # ワークスペースルート
├── pnpm-workspace.yaml
├── tsconfig.base.json       # 共通TypeScript設定
├── turbo.json              # Turboビルド設定
├── README.md
└── MIGRATION_PLAN.md
```

### 技術スタック

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

---

## 📋 詳細移行計画

### ✅ 進捗サマリ（2026-02-05）

- [x] Task 1: プロジェクト構成の設計と準備
- [x] Task 2: 新しいレポジトリの初期化
- [x] Task 3: TypeScript環境のセットアップ
- [x] Task 4: Core（utab-core）パッケージの移行
- [x] Task 5: Server（utab-server）パッケージの移行
- [x] Task 6: Web（utab-view-future）パッケージの移行
- [x] Task 7: ビルドとツール設定の統合
- [x] Task 8: Node.js・MongoDBバージョン指定
- [x] Task 9: テストとCI/CD設定
- [x] Task 10: ドキュメントとマイグレーションガイド
- [x] Task 11: 動作確認と最終調整
- [x] Task 12: デプロイ準備

### Task 1: プロジェクト構成の設計と準備

**目的**: モノレポ構造の基盤を構築

**ステータス**: ✅ 完了（docs/task1-foundation.md 反映）

**実施済み**:

- 技術選定: pnpm / Turbo / Node.js 20.11 LTS / ESLint + Prettier
- ルート構成指針: `.github/workflows`, `packages/{core,server,web}`, `docker`, `docs` など
- CI/CD 前提: GitHub Actions + Node 20 + pnpm

**詳細作業**:

1. **パッケージマネージャーの選定**
   - pnpm（推奨）: 高速、ディスク効率的、厳格な依存解決

2. **モノレポツールの選定**
   - Turbo（推奨）: 高速ビルドキャッシュ、並列実行

3. **バージョン管理戦略**
   - 統一バージョン
   - Changesets導入検討（変更履歴管理）

**成果物**:

- 技術選定ドキュメント
- ディレクトリ構造図

---

### Task 2: 新しいレポジトリの初期化

**目的**: モノレポの骨格作成

**ステータス**: ✅ 完了

**実施済み**:

- ルート設定ファイル一式: `package.json`, `pnpm-workspace.yaml`, `.editorconfig`, `.prettierrc`, `.eslintrc.js`, `.gitignore`
- モノレポ骨格: `packages/core`, `packages/server`, `packages/web` を作成
- 旧3レポジトリを `legacy/` に移動し `.gitignore` に追加

**詳細作業**:

1. **ルートpackage.json作成**

```json
{
  "name": "utab",
  "version": "2.0.0",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "format": "prettier --write \"**/*.{ts,tsx,vue,json,md}\""
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "eslint": "^8.56.0",
    "prettier": "^3.2.0",
    "turbo": "^1.12.0",
    "typescript": "^5.3.0"
  },
  "engines": {
    "node": ">=20.11.0",
    "pnpm": ">=8.0.0"
  },
  "packageManager": "pnpm@8.15.0"
}
```

2. **pnpm-workspace.yaml作成**

```yaml
packages:
  - 'packages/*'
```

3. **.gitignore更新**

```
node_modules/
dist/
build/
*.log
.env
.env.local
.turbo/
coverage/
```

4. **.editorconfig作成**

```ini
root = true

[*]
charset = utf-8
indent_style = space
indent_size = 2
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
```

5. **.prettierrc作成**

```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "es5"
}
```

6. **ESLint設定（.eslintrc.js）**

```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  env: {
    node: true,
    es2022: true,
  },
}
```

**成果物**:

- ルート設定ファイル一式
- 空のpackagesディレクトリ

---

### Task 3: TypeScript環境のセットアップ

**目的**: 全パッケージで共有するTypeScript基盤構築

**ステータス**: ✅ 完了（docs/task3-types.md 反映）

**実施済み**:

- `tsconfig.base.json` を NodeNext + strict 前提で整備
- 各パッケージの `tsconfig.json` を作成し `extends` で共通化
- 型定義ツールチェーン（`typescript`, `@types/node`, `@types/underscore`）を追加
- 共有型は `@utab/types` または `packages/core/types` で集約する方針を明記

**詳細作業**:

1. **tsconfig.base.json作成**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

2. **共通型定義パッケージ検討**
   - `@utab/types`: 全パッケージで共有する型定義
   - Tournament, Team, Adjudicator, Round等の共通型

3. **型定義パッケージインストール**

```bash
pnpm add -Dw @types/node @types/underscore
```

**成果物**:

- tsconfig.base.json
- 型定義戦略ドキュメント

---

### Task 4: Core（utab-core）パッケージの移行

**目的**: コアロジックをTypeScriptモノレポパッケージへ移行

**ステータス**: ✅ 完了（docs/task4-core.md 反映）

**実施済み**:

- `packages/core` を作成し TypeScript ライブラリとして構成
- `allocations`, `controllers`, `results`, `general` を移植し旧ロジックを踏襲
- `TournamentHandler` を含むエントリ API を TypeScript 化
- `tests/general-*.test.ts` を追加しコアの基本テストを実施

**詳細作業**:

#### 4.1 パッケージ初期化

1. **ディレクトリ作成**

```bash
mkdir -p packages/core/src
cd packages/core
```

2. **package.json作成**

```json
{
  "name": "@utab/core",
  "version": "2.0.0",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "dev": "tsup src/index.ts --format cjs,esm --dts --watch",
    "test": "vitest",
    "lint": "eslint src --ext .ts"
  },
  "dependencies": {
    "mongoose": "^8.1.0",
    "pino": "^8.17.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "vitest": "^1.2.0"
  }
}
```

3. **tsconfig.json作成**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

#### 4.2 ファイル移行戦略

**フェーズ1: 構造マッピング**

| 旧ファイル                      | 新ファイル                      | 変更内容                                          |
| ------------------------------- | ------------------------------- | ------------------------------------------------- |
| utab.js                         | src/index.ts                    | エントリポイント。各モジュールのexportを集約      |
| src/allocations.js              | src/allocations/index.ts        | サブモジュール（teams, adjudicators...）のexport  |
| src/allocations/teams.js        | src/allocations/teams.ts        | ロジックの型安全化                                |
| src/allocations/teams/\*        | src/allocations/teams/\*.ts     | 配下のモジュール（checks, matchings等）も全て移行 |
| src/allocations/adjudicators.js | src/allocations/adjudicators.ts | 同上                                              |
| src/allocations/venues.js       | src/allocations/venues.ts       | 同上                                              |
| src/controllers/handlers.js     | src/controllers/handlers.ts     | クラスに型注釈、Mongoose型定義                    |
| src/controllers/schemas.js      | src/models/schemas.ts           | Mongoose + TypeScript統合                         |
| src/general/loggers.js          | src/utils/logger.ts             | Winston → Pino移行                                |
| src/general/errors.js           | src/utils/errors.ts             | カスタムエラークラスの型安全化                    |
| src/general/math.js             | src/utils/math.ts               | 型注釈追加                                        |
| src/general/tools.js            | src/utils/tools.ts              | 型注釈追加                                        |

**フェーズ2: 依存パッケージ置き換え**

| 旧パッケージ   | 新パッケージ              | 理由                         |
| -------------- | ------------------------- | ---------------------------- |
| underscore     | lodash-es or ネイティブJS | 型定義充実、Tree-shaking対応 |
| winston        | pino                      | 高速、構造化ログ、型安全     |
| babel-polyfill | 削除                      | Node.js 20+で不要            |
| seedrandom     | 継続使用                  | 型定義追加                   |

**フェーズ3: Mongoose型定義強化**

現在のスキーマを型安全に:

```typescript
// src/models/team.model.ts
import { Schema, model, Document } from 'mongoose'

export interface ITeam extends Document {
  id: number
  name: string
  institutions: number[]
  speakers: number[]
  user_defined_data: Record<string, any>
}

const teamSchema = new Schema<ITeam>({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  institutions: [{ type: Number }],
  speakers: [{ type: Number }],
  user_defined_data: { type: Schema.Types.Mixed, default: {} },
})

export const Team = model<ITeam>('Team', teamSchema)
```

**フェーズ4: アルゴリズムの型安全化**

```typescript
// src/allocations/teams.ts の例
import { ITeam } from '../models/team.model'
import { ICompiledTeamResult } from '../types'

interface TeamRanks {
  [teamId: number]: number[]
}

type FilterFunction = (
  team: ITeam,
  a: ITeam,
  b: ITeam,
  dict: { r: number; compiled_team_results: ICompiledTeamResult[] }
) => number

export function getTeamRanks(
  r: number,
  teams: ITeam[],
  compiledTeamResults: ICompiledTeamResult[],
  filterFunctions: FilterFunction[]
): TeamRanks {
  const ranks: TeamRanks = {}

  for (const team of teams) {
    const others = teams.filter((other) => team.id !== other.id)
    others.sort(/* ... */)
    ranks[team.id] = others.map((o) => o.id)
  }

  return ranks
}
```

#### 4.3 テスト移行

既存のテスト（ルート直下の`test/`ディレクトリ内）をVitestへ移行:

```typescript
// tests/allocations.test.ts
import { describe, it, expect } from 'vitest'
import { getTeamRanks } from '../src/allocations/teams'

describe('Team Allocation', () => {
  it('should rank teams correctly', () => {
    // テストコード
  })
})
```

**成果物**:

- packages/core完全移行
- 型定義された全モジュール
- Vitest動作確認

---

### Task 5: Server（utab-server）パッケージの移行

**目的**: ExpressサーバーをTypeScript化、最新化

**ステータス**: ✅ 完了

**実施済み**:

- `packages/server` を TypeScript 化し、`app.ts` / `server.ts` に分割
- `config/environment.ts` / `config/database.ts` で環境変数と接続設定を整理
- セッション認証を bcrypt ベースに更新（MD5 廃止）
- Zod バリデーションと共通エラーハンドリングを導入
- 主要 API ルート（auth/tournaments/teams/adjudicators/draws/results/submissions/compiled/health）を実装

**詳細作業**:

#### 5.1 パッケージ初期化

**package.json作成**

```json
{
  "name": "@utab/server",
  "version": "2.0.0",
  "main": "./dist/server.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest",
    "lint": "eslint src --ext .ts"
  },
  "dependencies": {
    "@utab/core": "workspace:*",
    "express": "^4.18.2",
    "express-session": "^1.17.3",
    "mongoose": "^8.1.0",
    "pino": "^8.17.0",
    "pino-http": "^9.0.0",
    "zod": "^3.22.0",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/express-session": "^1.17.10",
    "@types/bcrypt": "^5.0.2",
    "@types/jsonwebtoken": "^9.0.5",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0"
  }
}
```

#### 5.2 アーキテクチャ再設計

**現在の問題点**:

- app.js: 595行の巨大ファイル
- ルーティング、ビジネスロジック、認証が混在
- グローバル変数の多用

**新しいアーキテクチャ**:

```
src/
├── server.ts              # エントリーポイント
├── app.ts                 # Expressアプリ設定
├── config/
│   ├── database.ts        # DB接続設定
│   └── environment.ts     # 環境変数管理
├── middleware/
│   ├── auth.ts            # 認証ミドルウェア
│   ├── error.ts           # エラーハンドリング
│   └── logging.ts         # リクエストログ
├── routes/
│   ├── index.ts           # ルート集約
│   ├── auth.routes.ts     # 認証関連
│   ├── tournament.routes.ts
│   ├── team.routes.ts
│   └── result.routes.ts
├── controllers/
│   ├── auth.controller.ts
│   ├── tournament.controller.ts
│   └── result.controller.ts
├── services/
│   ├── hash.service.ts    # MD5 → bcrypt
│   └── session.service.ts
├── models/
│   ├── user.model.ts
│   └── tournament.model.ts
└── types/
    └── express.d.ts       # Express型拡張
```

#### 5.3 重要な変更

**認証のモダン化**:

```typescript
// 旧: MD5ハッシュ（脆弱）
function hash(val, random=true) {
  let date = random ? DATE : 0
  return parseInt(md5(val, date).slice(0, ...), 16)
}

// 新: bcrypt（安全）
import bcrypt from 'bcrypt'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
```

**セッション管理の改善**:

```typescript
// src/middleware/auth.ts
import { RequestHandler } from 'express'

declare module 'express-session' {
  interface SessionData {
    userId: number
    usertype: 'superuser' | 'organizer' | 'adjudicator' | 'speaker' | 'audience'
    tournaments: number[]
  }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({
      errors: [{ name: 'Unauthorized', message: 'Please login first' }],
    })
  }
  next()
}
```

**型安全なルーティング**:

```typescript
// src/routes/tournament.routes.ts
import { Router } from 'express'
import { z } from 'zod'
import { TournamentController } from '../controllers/tournament.controller'
import { validateRequest } from '../middleware/validation'

const router = Router()
const controller = new TournamentController()

const createTournamentSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    style: z.number(),
    options: z.object({}).optional(),
  }),
})

router.post('/tournaments', validateRequest(createTournamentSchema), controller.create)

export default router
```

**環境変数管理**:

```typescript
// src/config/environment.ts
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  MONGODB_URI: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().url(),
})

export const env = envSchema.parse(process.env)
```

#### 5.4 マルチテナント対応の保持

既存のトーナメントごとのDB分離を維持:

```typescript
// src/services/tournament-db.service.ts
import mongoose from 'mongoose'
import { Tournament } from '@utab/core'

export class TournamentDBService {
  private connections = new Map<number, mongoose.Connection>()

  async getConnection(tournamentId: number): Promise<mongoose.Connection> {
    if (!this.connections.has(tournamentId)) {
      const conn = await mongoose.createConnection(`${process.env.MONGODB_URI}/${tournamentId}`)
      this.connections.set(tournamentId, conn)
    }
    return this.connections.get(tournamentId)!
  }
}
```

#### 5.5 クリーンアップ

1. **既存のベンダーライブラリ削除**
   - `lib/utab-core/`フォルダを完全に削除し、`node_modules`経由での参照に切り替える。

2. **ハードコード値の置換**
   - コードベース全体からハードコードされたDB名（例：`heroku_zm37jwvt`）を検索し、環境変数または設定ファイルからの参照に変更する。
   - `DBTOURNAMENTSNAME`, `DBSTYLESNAME`, `DBUSERSNAME` などの定数を設定ファイル（`src/config/constants.ts`等）に集約する。

**成果物**:

- packages/server完全移行
- 型安全なAPI
- モダンな認証システム

---

### Task 6: Web（utab-view-future）パッケージの移行

**目的**: Vue 2 → Vue 3 + TypeScript + Vite移行

**ステータス**: ✅ 完了

**実施済み**:

- Vue 3 + Vite + TypeScript 構成で `packages/web` を整備
- Pinia ストア（auth/tournament/teams/draws/results/submissions/adjudicators/compiled 等）を実装
- 管理者・参加者の主要ビューと共通コンポーネントを移植
- Highcharts 統合と統計ビュー（mstat 系）を移行

**詳細作業**:

#### 6.1 パッケージ初期化

**package.json作成**

```json
{
  "name": "@utab/web",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "lint": "eslint src --ext .ts,.vue"
  },
  "dependencies": {
    "vue": "^3.4.0",
    "vue-router": "^4.2.5",
    "pinia": "^2.1.7",
    "element-plus": "^2.5.0",
    "highcharts": "^11.2.0",
    "highcharts-vue": "^2.0.0",
    "axios": "^1.6.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "vite": "^5.0.0",
    "vue-tsc": "^1.8.0",
    "typescript": "^5.3.0",
    "unplugin-auto-import": "^0.17.0",
    "unplugin-vue-components": "^0.26.0"
  }
}
```

#### 6.2 Vite設定

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      resolvers: [ElementPlusResolver()],
      dts: 'src/auto-imports.d.ts',
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: 'src/components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
```

#### 6.3 Vue 2 → Vue 3移行

**主要な変更点**:

1. **main.js → main.ts**

```typescript
// 旧: src/main.js
import Vue from 'vue'
import VueRouter from 'vue-router'
import Vuex from 'vuex'
import ElementUI from 'element-ui'

Vue.use(VueRouter)
Vue.use(Vuex)
Vue.use(ElementUI)

// 新: src/main.ts
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import App from './App.vue'
import routes from './router'

const app = createApp(App)
const router = createRouter({
  history: createWebHistory(),
  routes,
})
const pinia = createPinia()

app.use(router)
app.use(pinia)
app.use(ElementPlus)
app.mount('#app')
```

2. **Vuex → Pinia**

```typescript
// 旧: src/stores.js (Vuex)
export default {
  state: {
    tournaments: [],
    auth: { username: '' },
  },
  mutations: {
    tournaments(state, payload) {
      state.tournaments = payload.tournaments
    },
  },
  actions: {
    async init_tournaments({ commit }) {
      // ...
    },
  },
}

// 新: src/stores/tournament.ts (Pinia)
import { defineStore } from 'pinia'
import type { Tournament } from '../types'

export const useTournamentStore = defineStore('tournament', {
  state: () => ({
    tournaments: [] as Tournament[],
    loading: false,
  }),

  getters: {
    targetTournament: (state) => (id: number) => state.tournaments.find((t) => t.id === id),
  },

  actions: {
    async fetchTournaments() {
      this.loading = true
      try {
        const response = await fetch('/api/tournaments')
        const data = await response.json()
        this.tournaments = data.tournaments
      } finally {
        this.loading = false
      }
    },
  },
})
```

3. **Options API → Composition API**

```vue
<!-- 旧: Login.vue (Options API) -->
<script>
export default {
  data() {
    return {
      username: '',
      password: '',
    }
  },
  methods: {
    async login() {
      // ...
    },
  },
}
</script>

<!-- 新: Login.vue (Composition API + TypeScript) -->
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const loading = ref(false)

async function login() {
  loading.value = true
  try {
    await authStore.login(username.value, password.value)
    router.push('/')
  } catch (error) {
    // エラー処理
  } finally {
    loading.value = false
  }
}
</script>
```

#### 6.4 コンポーネント移行戦略

**優先順位**:

1. **高優先度**（ユーザー影響大）
   - Login.vue, Signup.vue
   - admin/tournament/round/Allocation.vue
   - user/tournament/participant/round/ballot/

2. **中優先度**
   - slides系コンポーネント
   - stats系コンポーネント

3. **低優先度**
   - ユーティリティコンポーネント

**共通パターン**:

```vue
<!-- draggable-list.vue のVue 3化 -->
<template>
  <div class="draggable-list">
    <Draggable v-model="items" @end="onDragEnd">
      <template #item="{ element }">
        <div class="list-item">{{ element.name }}</div>
      </template>
    </Draggable>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Draggable from 'vuedraggable'

interface Item {
  id: number
  name: string
}

interface Props {
  modelValue: Item[]
}

interface Emits {
  (e: 'update:modelValue', value: Item[]): void
  (e: 'change', value: Item[]): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const items = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

function onDragEnd() {
  emit('change', items.value)
}
</script>
```

#### 6.5 Highcharts統合

```typescript
// src/composables/useCharts.ts
import Highcharts from 'highcharts'
import HighchartsMore from 'highcharts/highcharts-more'
import HighchartsExporting from 'highcharts/modules/exporting'

HighchartsMore(Highcharts)
HighchartsExporting(Highcharts)

export function useHighcharts() {
  return { Highcharts }
}
```

#### 6.6 型定義

```typescript
// src/types/tournament.ts
export interface Tournament {
  id: number
  name: string
  style: number
  rounds: Round[]
  teams: Team[]
  adjudicators: Adjudicator[]
  venues: Venue[]
}

export interface Round {
  id: number
  name: string
  completed: boolean
}

export interface Team {
  id: number
  name: string
  institutions: number[]
  speakers: number[]
}

// src/types/api.ts
export interface ApiResponse<T> {
  data: T
  errors: ApiError[]
}

export interface ApiError {
  name: string
  message: string
  code?: number
}
```

**その他**:

- `.flowconfig` およびFlow関連のBabel設定を削除する。
- Highcharts等のライブラリをVue 3対応版（`highcharts-vue`）に更新する。

**成果物**:

- packages/web完全移行
- Vue 3 + TypeScript
- Viteベースの高速開発環境

---

### Task 7: ビルドとツール設定の統合

**目的**: モノレポ全体のビルド最適化

**ステータス**: ✅ 完了

**実施済み**:

- `turbo.json` を追加し、`build/test/lint` パイプラインを統合
- Docker 環境（`docker-compose.yml`, `docker/Dockerfile.server`, `docker/Dockerfile.web`, `docker/nginx.conf`）を整備
- MongoDB 8.0 + API + Web のローカル起動フローを用意

**詳細作業**:

#### 7.1 Turbo設定

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "outputs": []
    }
  }
}
```

#### 7.2 Docker環境構築

**docker-compose.yml**

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:7.0
    ports:
      - '27017:27017'
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
    volumes:
      - mongo_data:/data/db

  server:
    build:
      context: .
      dockerfile: docker/Dockerfile.server
    ports:
      - '3000:3000'
    environment:
      NODE_ENV: development
      MONGODB_URI: mongodb://admin:password@mongodb:27017
      SESSION_SECRET: ${SESSION_SECRET}
    depends_on:
      - mongodb
    volumes:
      - ./packages/server:/app/packages/server
      - /app/node_modules

  web:
    build:
      context: .
      dockerfile: docker/Dockerfile.web
    ports:
      - '8080:8080'
    environment:
      VITE_API_URL: http://localhost:3000
    volumes:
      - ./packages/web:/app/packages/web
      - /app/node_modules

volumes:
  mongo_data:
```

**Dockerfile.server**

```dockerfile
FROM node:20-alpine AS base
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/server/package.json ./packages/server/
RUN pnpm install --frozen-lockfile

COPY packages/core ./packages/core
COPY packages/server ./packages/server
RUN pnpm --filter @utab/core build
RUN pnpm --filter @utab/server build

FROM base AS runner
WORKDIR /app
COPY --from=builder /app/packages/server/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

#### 7.3 環境変数管理

**.env.example**

```bash
# Server
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://admin:password@localhost:27017
SESSION_SECRET=your-super-secret-session-key-min-32-chars
CORS_ORIGIN=http://localhost:8080

# Web
VITE_API_URL=http://localhost:3000/api
```

#### 7.4 スクリプト統合

**package.json (root)**

```json
{
  "scripts": {
    "dev": "turbo run dev",
    "dev:server": "pnpm --filter @utab/server dev",
    "dev:web": "pnpm --filter @utab/web dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "test:watch": "turbo run test -- --watch",
    "lint": "turbo run lint",
    "format": "prettier --write \"**/*.{ts,tsx,vue,json,md}\"",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down",
    "clean": "turbo run clean && rm -rf node_modules"
  }
}
```

**成果物**:

- Turboビルド設定
- Docker開発環境
- 統一されたスクリプト

---

### Task 8: Node.js・MongoDBバージョン指定

**目的**: 実行環境の明確化と最新化

**ステータス**: ✅ 完了

**実施済み**:

- `.nvmrc` を `20.11.0` で固定
- ルート `package.json` に `node >=20.11.0`, `pnpm >=8` を設定
- MongoDB 8.0 を前提に接続設定を調整（タイムアウト/プール設定）
- README / MIGRATION.md でバージョン要件を明記

**詳細作業**:

1. **.nvmrc作成**

```
20.11.0
```

2. **package.json engines更新**

```json
{
  "engines": {
    "node": ">=20.11.0",
    "pnpm": ">=8.0.0"
  }
}
```

3. **MongoDB接続設定**

```typescript
// packages/server/src/config/database.ts
import mongoose from 'mongoose'

export async function connectDatabase() {
  await mongoose.connect(process.env.MONGODB_URI!, {
    // MongoDB 7.x対応設定
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err)
  })

  console.log('Connected to MongoDB 7.x')
}
```

4. **README更新**

```markdown
## 必要環境

- Node.js: 20.11.0 以上
- pnpm: 8.0.0 以上
- MongoDB: 7.0 以上

### セットアップ

\`\`\`bash

# Node.jsバージョン確認

node --version # v20.11.0以上

# pnpmインストール

corepack enable

# 依存関係インストール

pnpm install

# MongoDB起動（Docker）

pnpm docker:up
\`\`\`
```

**成果物**:

- バージョン管理ファイル
- 互換性ドキュメント

---

### Task 9: テストとCI/CD設定

**目的**: 自動テスト・継続的インテグレーション構築

**ステータス**: ✅ 完了

**実施済み**:

- 各パッケージに `vitest.config.ts` を追加
- `packages/core` と `packages/server` でテストを整備（`pnpm test` で実行）
- GitHub Actions（`.github/workflows/ci.yml`）で install/test/build を実行

**詳細作業**:

#### 9.1 Vitestセットアップ

**vitest.config.ts (各パッケージ)**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.d.ts', '**/*.config.*'],
    },
  },
})
```

#### 9.2 テスト移行例

```typescript
// packages/core/tests/allocations.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getTeamRanks } from '../src/allocations/teams'
import type { ITeam } from '../src/models/team.model'

describe('Team Allocation', () => {
  let teams: ITeam[]

  beforeEach(() => {
    teams = [
      { id: 1, name: 'Team A' /* ... */ },
      { id: 2, name: 'Team B' /* ... */ },
    ]
  })

  it('should rank teams correctly', () => {
    const ranks = getTeamRanks(1, teams, [], [])
    expect(ranks[1]).toContain(2)
  })
})
```

#### 9.3 GitHub Actions設定

**.github/workflows/ci.yml**

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm lint

  test:
    runs-on: ubuntu-latest
    services:
      mongodb:
        image: mongo:7.0
        ports:
          - 27017:27017
        options: >-
          --health-cmd "mongosh --eval 'db.adminCommand({ping: 1})'"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm test
        env:
          MONGODB_URI: mongodb://localhost:27017/test

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm build
```

**成果物**:

- Vitestベースのテスト
- GitHub Actions CI/CD

---

### Task 10: ドキュメントとマイグレーションガイド

**目的**: 新旧ユーザー向けドキュメント整備

**ステータス**: ✅ 完了

**実施済み**:

- `README.md` をモノレポ構成に合わせて更新
- `MIGRATION.md` を追加し、破壊的変更・移行手順を整理
- `packages/core/README.md` を整備
- `docs/` 配下に各タスクの実施メモを追加

**詳細作業**:

#### 10.1 新README.md

```markdown
# UTab - University Tabulation System

モダンなディベート大会管理システム（TypeScript モノレポ版）

## 特徴

- 🎯 **型安全**: TypeScript完全対応
- ⚡ **高速**: Vite + pnpmによる高速ビルド
- 🏗️ **モノレポ**: Turboによる効率的な管理
- 🧪 **テスト**: Vitestによる包括的テスト
- 🐳 **Docker**: 開発環境の簡単セットアップ

## クイックスタート

\`\`\`bash

# 依存関係インストール

pnpm install

# 開発サーバー起動

pnpm dev

# または個別に

pnpm dev:server # APIサーバー: http://localhost:3000
pnpm dev:web # Webアプリ: http://localhost:8080
\`\`\`

## パッケージ構成

- `@utab/core`: コアロジック（アルゴリズム、DB）
- `@utab/server`: Express APIサーバー
- `@utab/web`: Vue 3フロントエンド

## 技術スタック

- TypeScript 5.3+
- Node.js 20+
- MongoDB 7.0+
- Vue 3 + Vite
- Mongoose 8
- Express 4
```

#### 10.2 MIGRATION.md

````markdown
# 移行ガイド（v1 → v2）

## 破壊的変更

### APIエンドポイント

変更なし（後方互換性維持）

### データベーススキーマ

基本的に互換性あり。ただし以下注意:

- `user_defined_data`の型検証が厳格化
- MongoDB 7.0+が必須

### 認証

⚠️ **重要**: パスワードハッシュ方式変更

**旧**: MD5（脆弱）
**新**: bcrypt

**対応**:

```bash
# 既存ユーザーは再ログイン時にパスワード再ハッシュ化
# または移行スクリプト実行
pnpm migrate:passwords
```

## 移行手順

### 1. データベースバックアップ

```bash
mongodump --uri="mongodb://localhost:27017/your-db" --out=./backup
```

### 2. MongoDB 7.0アップグレード

```bash
# Docker使用の場合
docker-compose down
# docker-compose.ymlでmongo:7.0に変更
docker-compose up -d
```

### 3. 新バージョンデプロイ

```bash
pnpm install
pnpm build
pnpm start
```

## API互換性

v1 APIは完全に互換性があります。既存クライアントは変更不要。
````

#### 10.3 各パッケージREADME

**packages/core/README.md**

```markdown
# @utab/core

UTabのコアロジックパッケージ

## 主要機能

- チーム・ジャッジアロケーション
- ドロー生成アルゴリズム
- 結果集計
- Mongooseモデル

## 使用例

\`\`\`typescript
import { Tournament } from '@utab/core'

const tournament = new Tournament({ name: 'Test Tournament' })
await tournament.teams.create({ id: 1, name: 'Team A' })
\`\`\`
```

**成果物**:

- 包括的README
- 移行ガイド
- API仕様書

---

### Task 11: 動作確認と最終調整

**目的**: 全機能の統合テスト

**ステータス**: ✅ 完了（docs/task11-validation.md 反映）

**実施済み**:

- `pnpm build` 成功
- `pnpm test`（core/server/web）成功
- `pnpm audit` 実施（現状はクリーン）

**確認済み**:

- Docker 起動（API/Web へのアクセス）
- 管理者/参加者フローの手動検証
- 認証フロー・永続化確認

**補足**:

- Web の型チェックは Node 20.11.0 で実行済み（`tsc -p packages/web/tsconfig.lint.json --noEmit`）

**詳細作業**:

#### 11.1 統合テストシナリオ

1. **大会作成フロー**
   - ユーザー登録 → ログイン
   - 大会作成
   - チーム・ジャッジ登録
   - ラウンド作成
   - ドロー生成
   - 結果入力
   - 集計確認

2. **パフォーマンステスト**
   - 1000チームでのドロー生成速度
   - 並行アクセステスト
   - メモリリーク確認

3. **セキュリティ監査**
   ```bash
   pnpm audit
   pnpm dlx npm-check-updates -u
   ```

#### 11.2 チェックリスト

- [x] 全パッケージビルド成功
- [x] 全テストパス
- [x] Lint/Format通過
- [x] Docker環境起動確認
- [x] MongoDB接続確認
- [x] API全エンドポイント動作
- [x] フロントエンド全ページ表示
- [x] 認証フロー動作
- [x] データ永続化確認
- [x] エラーハンドリング確認

**成果物**:

- 動作確認レポート
- 既知の問題リスト

---

### Task 12: デプロイ準備

**目的**: 本番環境へのデプロイ準備

**ステータス**: ✅ 完了

**実施済み**:

- 環境別設定ファイル（`.env.development`, `.env.staging`, `.env.production`）を追加
- `packages/web/vite.config.ts` に本番ビルド最適化（terser + manualChunks）を反映
- `DEPLOYMENT.md` に Heroku / Vercel / Docker / GHCR の手順を整理
- GitHub Actions の `Deploy` ワークフローを追加

**詳細作業**:

#### 12.1 環境別設定

```
.env.development
.env.staging
.env.production
```

#### 12.2 本番ビルド最適化

**packages/web/vite.config.ts**

```typescript
export default defineConfig({
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'element-plus': ['element-plus'],
          charts: ['highcharts'],
        },
      },
    },
  },
})
```

#### 12.3 デプロイドキュメント

```markdown
# デプロイ手順

## Heroku

\`\`\`bash
heroku create utab-server
heroku addons:create mongolab:sandbox
heroku config:set NODE_ENV=production
git push heroku main
\`\`\`

## Vercel (Web)

\`\`\`bash
cd packages/web
vercel --prod
\`\`\`
```

**成果物**:

- デプロイ設定
- 本番環境ドキュメント

---

## ⚠️ リスクと対策

### リスク1: Vue 2 → 3移行の複雑性

**対策**:

- 段階的移行（Vue 3 Migration Build使用）
- コンポーネント単位で順次移行

### リスク2: データ損失

**対策**:

- 移行前の完全バックアップ
- ステージング環境での十分なテスト

### リスク3: パフォーマンス低下

**対策**:

- ベンチマークテスト実施
- プロファイリングツール活用

### リスク4: 破壊的変更による既存ユーザー影響

**対策**:

- API後方互換性維持
- 段階的ロールアウト

---

## 📚 参考リソース

- [Vue 3 Migration Guide](https://v3-migration.vuejs.org/)
- [Mongoose 8 Migration](https://mongoosejs.com/docs/migrating_to_8.html)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vite Guide](https://vitejs.dev/guide/)
- [pnpm Workspace](https://pnpm.io/workspaces)
- [Turbo Docs](https://turbo.build/repo/docs)

---
