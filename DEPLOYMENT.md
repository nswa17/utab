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
- Web: `VITE_API_URL`, `VITE_APP_TITLE`(任意), `VITE_BRAND_NAME`(任意), `VITE_BRAND_LOGO_URL`(任意)

本番環境では必ず `https://` の URL を使う。

- Server（production 例）
  - `NODE_ENV=production`
  - `CORS_ORIGIN=https://tab.example.com`
- Web（production 例）
  - `VITE_API_URL=https://api.tab.example.com/api`
  - `VITE_APP_TITLE=UTab`
  - `VITE_BRAND_NAME=UTab` (任意)
  - `VITE_BRAND_LOGO_URL=/logo.png` (任意)

`VITE_BRAND_LOGO_URL=/logo.png` を使う場合は、`packages/web/public/logo.png` をリポジトリに置いてからデプロイする。

## 1-1. HTTPS ドメイン設定（初回のみ）

### Server（Heroku）

```bash
heroku domains:add api.tab.example.com -a utab-server
heroku certs:auto:enable -a utab-server
```

### Web（Vercel）

Vercel project の `Settings -> Domains` で `tab.example.com` を追加する。  
Vercel 側は証明書を自動発行するため、通常は追加作業不要。

### DNS

- `tab.example.com` -> Vercel
- `api.tab.example.com` -> Heroku

DNS 反映後に、両方のドメインで HTTPS が有効化されていることを確認する。

## 1-2. VPS（IPアドレス運用）向けの最短構成

このリポジトリには VPS 用の雛形ファイルを追加済み。

- `docker-compose.vps.yml`
- `packages/web/.env.production`
- `packages/web/public/logo.png`（仮画像）
- `docker/nginx.vps-ip.conf.example`

手順:

1. `docker-compose.vps.yml` の以下を編集する
   - `change-me-mongo-root-password`
   - `change-me-session-secret-at-least-32-chars`
   - `https://YOUR_VPS_IP`
2. `packages/web/.env.production` の以下を編集する
   - `VITE_APP_TITLE`（ブラウザタブ名）
   - `VITE_BRAND_NAME`
   - `VITE_BRAND_LOGO_URL`（`/logo.png` 以外にしたい場合）
3. ロゴ画像を `packages/web/public/logo.png` に上書きする
4. コンテナ起動

```bash
docker compose -f docker-compose.vps.yml up -d --build
```

5. VPS ホスト側 Nginx の設定
   - `docker/nginx.vps-ip.conf.example` を `/etc/nginx/sites-available/utab.conf` にコピー
   - `YOUR_VPS_IP` を実IPに置換
   - `/etc/nginx/sites-enabled/` にリンクして `nginx -t && systemctl reload nginx`

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
