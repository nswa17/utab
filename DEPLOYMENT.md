# デプロイ手順（staging -> production）

この手順は `Server=Heroku`、`Web=Vercel` を前提とした運用手順です。  
`legacy/` はデプロイ対象に含めず、現行 monorepo の `packages/*` のみを対象にします。

## 0. 事前確認（必須）

```bash
pnpm install --frozen-lockfile
pnpm --filter @utab/core test
pnpm --filter @utab/server test
pnpm --filter @utab/web typecheck
pnpm --filter @utab/web test
```

- 失敗したらデプロイしない
- 反映対象コミット SHA を控える（ロールバック用）

## 1. 環境変数

`staging` と `production` で分離して設定する。

- Server: `NODE_ENV`, `MONGODB_URI`, `SESSION_SECRET`, `CORS_ORIGIN`
- Web: `VITE_API_URL`

## 2. Staging 反映

### 2-1. Server（Heroku staging app）

```bash
heroku git:remote -a utab-server-staging -r heroku-staging
git push heroku-staging HEAD:main
heroku releases -a utab-server-staging
```

### 2-2. Web（Vercel staging project）

`utab-web-staging` プロジェクトに対してデプロイする（本番プロジェクトとは分離）。

```bash
cd packages/web
vercel --prod
```

### 2-3. Staging スモークテスト

- 管理者ログイン
- 大会一覧表示
- ラウンド管理の読み込み
- ブレイク候補更新と保存（手動 seed 編集を含む）
- レポート生成（teams/speakers の最低1種）

## 3. Production 反映

Staging 検証を通過した同一コミットのみを本番へ反映する。

### 3-1. Server（Heroku production app）

Heroku Pipeline がある場合:

```bash
heroku pipelines:promote --app utab-server-staging
```

Pipeline 未設定の場合:

```bash
heroku git:remote -a utab-server -r heroku-prod
git push heroku-prod <stagingで反映したSHA>:main
```

### 3-2. Web（Vercel production project）

```bash
cd packages/web
vercel --prod
```

## 4. 反映後チェック（本番）

- `/api/health` もしくは主要 API の 200 応答確認
- 管理画面初期表示
- 参加者画面初期表示
- 直近ラウンドの閲覧・提出導線

## 5. ロールバック

### Server（Heroku）

```bash
heroku releases -a utab-server
heroku rollback v<previous_release_number> -a utab-server
```

### Web（Vercel）

- Vercel ダッシュボードから直前の安定デプロイを `Promote to Production`
- もしくは安定コミットで `vercel --prod` を再実行
