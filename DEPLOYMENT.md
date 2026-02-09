# デプロイ手順

## 共通

- `.env.production` を環境に合わせて設定
- `MONGODB_URI` / `SESSION_SECRET` / `CORS_ORIGIN` を必ず本番用に変更

## Heroku（Server）

```bash
heroku create utab-server
heroku config:set NODE_ENV=production
heroku config:set MONGODB_URI=...
heroku config:set SESSION_SECRET=...
heroku config:set CORS_ORIGIN=...
git push heroku main
```

## Vercel（Web）

```bash
cd packages/web
vercel --prod
```

Vercel の環境変数に `VITE_API_URL` を設定してください。

## Docker（セルフホスト）

```bash
docker-compose up --build
```

## GitHub Actions（GHCR）

1. GitHub Actions で `Deploy` を実行
2. イメージが `ghcr.io/<owner>/utab-server:latest` と `ghcr.io/<owner>/utab-web:latest` に公開される
