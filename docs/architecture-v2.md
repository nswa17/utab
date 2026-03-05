# 現行アーキテクチャ（UTab v3）

> ファイル名は互換のため `architecture-v2.md` のままですが、内容は v3 系の現行構成です。

## 全体構成

UTab は pnpm workspace + Turbo の TypeScript モノレポです。

- `@utab/core`: 配席・集計アルゴリズム
- `@utab/server`: Express API + MongoDB
- `@utab/web`: Vue 3 管理/参加者 UI

```text
utab/
├── .github/workflows/       # CI / deploy
├── docs/                    # 設計・運用・履歴ドキュメント
├── docker/                  # Dockerfile / nginx 設定
├── legacy/                  # 旧実装（v2 系）
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── allocations/
│   │   │   ├── controllers/
│   │   │   ├── general/
│   │   │   ├── results/
│   │   │   └── types/
│   │   └── tests/
│   ├── server/
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── controllers/
│   │   │   ├── middleware/
│   │   │   ├── models/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   └── devtools/
│   │   └── test/
│   └── web/
│       ├── src/
│       │   ├── components/
│       │   ├── composables/
│       │   ├── router/
│       │   ├── stores/
│       │   ├── utils/
│       │   └── views/
│       └── public/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── turbo.json
```

## 実行フロー

1. `@utab/web` が `@utab/server` の `/api/*` を呼び出す
2. `@utab/server` が入力検証・権限判定・監査ログ記録を行う
3. 配席/集計は `@utab/core` に委譲
4. 永続化は MongoDB（Mongoose）

## 技術スタック（現行）

| 領域 | 採用 | 補足 |
| --- | --- | --- |
| 言語 | TypeScript 5.4.5 | ルートで固定 |
| 実行環境 | Node.js >= 20.11.0 | `.nvmrc` は 24 |
| パッケージ管理 | pnpm 10.x | workspace 構成 |
| モノレポ管理 | Turbo | `turbo run` で並列実行 |
| サーバー | Express 4 + Zod | rate-limit / slow-down 併用 |
| DB | MongoDB 8 + Mongoose 8.1 | session store は connect-mongo |
| Web | Vue 3 + Vite 5 | 状態管理は Pinia |
| UI | Element Plus | 管理画面 UI 基盤 |
| テスト | Vitest | server 統合テストは `integration.part*.test.ts` |
| CI | GitHub Actions | `ci.yml` / `deploy.yml` |

## セキュリティ実装（要点）

- セッション認証（`express-session` + MongoStore）
- 大会アクセス制御（大会パスワード + access session）
- CORS ホワイトリスト運用（`CORS_ORIGIN` 必須）
- CSRF Origin/Referer チェック
- API / auth / submissions / raw-results のレートリミット
- 公開レスポンスのサニタイズ
- 監査ログ API（`/api/audit-logs`）

詳細は [security-roadmap.md](security-roadmap.md) を参照してください。
